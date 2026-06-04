import { join } from 'node:path'
import ytdlpExec from 'yt-dlp-exec'
import { create as createYtDlp } from 'yt-dlp-exec'
import { lawRagChatJson } from '@/lib/law-rag-llm'
import type { LearningPlan, Lesson, VideoAnalysis, VideoIndex, VideoLanguage, VideoRecommendation, VideoSearchMatch, VideoTranscriptSegment } from '@/lib/types'

const ytdlp = createYtDlp(join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')) || ytdlpExec
const videoMatchScoreFloor = 0.025
const videoMatchRelativeFloor = 0.35

type YtDlpInfo = {
  id?: string
  title?: string
  duration?: number
  webpage_url?: string
  requested_subtitles?: Record<string, SubtitleInfo>
  subtitles?: Record<string, SubtitleInfo[]>
  automatic_captions?: Record<string, SubtitleInfo[]>
}

type YtDlpSearchResult = {
  entries?: YtDlpInfo[]
}

type SubtitleInfo = {
  ext?: string
  url?: string
}

type TranscriptItem = {
  startSeconds: number
  endSeconds: number
  text: string
}

export async function analyzeYoutubeVideo(url: string, lessons: Lesson[], language: VideoLanguage = 'vi'): Promise<VideoAnalysis> {
  const info = await getYoutubeInfo(url, language)
  const transcript = await getTranscript(info, language)
  if (transcript.length === 0) {
    throw new Error('Không lấy được transcript. Hãy dùng video có caption public hoặc thử video khác.')
  }

  const chunks = chunkTranscript(transcript)
  const titledChunks = await titleTranscriptChunks(chunks, info.title || 'YouTube video')
  const video: VideoIndex = {
    id: info.id || stableId(url),
    url: info.webpage_url || url,
    title: info.title || 'YouTube video',
    durationMinutes: Math.max(1, Math.round((info.duration || titledChunks.at(-1)?.endSeconds || 60) / 60)),
    segments: titledChunks.map((chunk, index) => ({
      id: `segment-${index + 1}`,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
      title: chunk.title,
      summary: chunk.summary,
      text: chunk.text,
      embedding: embedText(`${chunk.title}\n${chunk.text}`)
    }))
  }

  return {
    video,
    matchesByLessonId: buildDistinctMatchesByLesson(video, lessons)
  }
}

export async function suggestYoutubeVideo(plan: LearningPlan, lesson: Lesson | null): Promise<VideoRecommendation> {
  const query = await buildVideoSearchQuery(plan, lesson)
  const candidates = await searchYoutubeCandidates(query)

  if (candidates.length === 0) {
    throw new Error('Không tìm được video YouTube phù hợp.')
  }

  const picked = await pickVideoCandidate(plan, lesson, query, candidates)
  return {
    title: picked.title || 'YouTube video',
    url: picked.webpage_url || canonicalYoutubeUrl(picked.id || ''),
    durationMinutes: Math.max(1, Math.round((picked.duration || 60) / 60)),
    reason: picked.reason || `Phù hợp với bài "${lesson?.title || plan.title}".`,
    query,
    scope: lesson ? 'lesson' : 'plan'
  }
}

export async function suggestPlanWideYoutubeVideo(plan: LearningPlan): Promise<VideoRecommendation | null> {
  const languageLabel = plan.profile.videoLanguage === 'en' ? 'English' : 'Vietnamese'
  const query = `${plan.profile.topic} complete course ${languageLabel} ${plan.profile.level}`
  const candidates = await searchYoutubeCandidates(query, 10)
  if (candidates.length === 0) return null

  const parsed = await lawRagChatJson(
    [
      {
        role: 'system',
        content:
          'Decide whether one YouTube video can cover the whole learning plan. Choose only from candidates. Return JSON {"useShared":true,"index":0,"reason":"..."} or {"useShared":false,"reason":"..."}. Prefer shared video only when it likely covers most weeks, not just the first lesson.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: plan.profile.topic,
          goal: plan.profile.goal,
          level: plan.profile.level,
          videoLanguage: languageLabel,
          weeks: plan.lessons.map((lesson) => ({
            week: lesson.week,
            title: lesson.title,
            objective: lesson.objective
          })),
          candidates: candidates.map((candidate, index) => ({
            index,
            title: candidate.title,
            durationMinutes: candidate.duration ? Math.round(candidate.duration / 60) : null,
            url: candidate.webpage_url
          }))
        })
      }
    ],
    0.2
  )

  const useShared = Boolean((parsed as { useShared?: unknown } | null)?.useShared)
  const index = Number((parsed as { index?: unknown } | null)?.index)
  if (!useShared || !Number.isInteger(index) || !candidates[index]) return null

  const reason = parsed && typeof (parsed as { reason?: unknown }).reason === 'string' ? (parsed as { reason: string }).reason.trim() : ''
  const picked = candidates[index]
  return {
    title: picked.title || 'YouTube video',
    url: picked.webpage_url || canonicalYoutubeUrl(picked.id || ''),
    durationMinutes: Math.max(1, Math.round((picked.duration || 60) / 60)),
    reason: reason || 'Video tổng hợp phù hợp để dùng cho toàn bộ lộ trình.',
    query,
    scope: 'plan'
  }
}

export function searchVideoSegments(video: VideoIndex, query: string, limit?: number): VideoSearchMatch[] {
  const queryEmbedding = embedText(query)
  const matches = video.segments
    .map((segment) => ({
      ...segment,
      score: cosineSimilarity(queryEmbedding, segment.embedding),
      url: withYoutubeStartTime(video.url, segment.startSeconds),
      videoTitle: video.title
    }))
    .filter((segment) => segment.score > 0)
    .sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds)

  return typeof limit === 'number' ? matches.slice(0, limit) : matches
}

function buildDistinctMatchesByLesson(video: VideoIndex, lessons: Lesson[]) {
  const usedSegmentIds = new Set<string>()

  return Object.fromEntries(
    lessons.map((lesson) => {
      const selected = filterRelevantVideoMatches(searchVideoSegments(video, lessonQuery(lesson))).filter((match) => !usedSegmentIds.has(match.id))
      selected.forEach((match) => usedSegmentIds.add(match.id))
      return [lesson.id, selected]
    })
  )
}

function filterRelevantVideoMatches(matches: VideoSearchMatch[]) {
  const topScore = matches[0]?.score || 0
  if (!topScore) return []

  const minimumScore = Math.max(videoMatchScoreFloor, topScore * videoMatchRelativeFloor)
  return matches.filter((match) => match.score >= minimumScore)
}

function lessonQuery(lesson: Lesson) {
  return [lesson.title, lesson.objective, lesson.checkpoint, ...lesson.activities, ...lesson.homework, ...lesson.resources, ...lesson.quiz].join('\n')
}

async function getYoutubeInfo(url: string, language: VideoLanguage): Promise<YtDlpInfo> {
  return ytdlp(url, {
    dumpSingleJson: true,
    skipDownload: true,
    writeSub: true,
    writeAutoSub: true,
    subLang: language === 'en' ? 'en.*,en,vi' : 'vi,en.*,en',
    subFormat: 'json3',
    noPlaylist: true,
    noWarnings: true
  }) as Promise<YtDlpInfo>
}

async function buildVideoSearchQuery(plan: LearningPlan, lesson: Lesson | null) {
  const languageLabel = plan.profile.videoLanguage === 'en' ? 'English' : 'Vietnamese'
  const fallback = `${plan.profile.topic} ${lesson?.title || plan.profile.goal} ${languageLabel} tutorial`
  const parsed = await lawRagChatJson(
    [
      {
        role: 'system',
        content:
          'Tạo một truy vấn YouTube ngắn để tìm video học tập phù hợp. Trả về JSON {"query":"..."}. Query nên có chủ đề, trình độ, bài học, từ khóa tutorial/course/lesson nếu phù hợp. Không trả URL.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: plan.profile.topic,
          goal: plan.profile.goal,
          level: plan.profile.level,
          videoLanguage: languageLabel,
          lesson: lesson
            ? {
                title: lesson.title,
                objective: lesson.objective,
                checkpoint: lesson.checkpoint
              }
            : null
        })
      }
    ],
    0.2
  )

  const query = parsed && typeof (parsed as { query?: unknown }).query === 'string' ? (parsed as { query: string }).query.trim() : ''
  return query || fallback
}

async function searchYoutubeCandidates(query: string, limit = 8): Promise<Array<YtDlpInfo & { reason?: string }>> {
  const result = (await ytdlp(`ytsearch${limit}:${query}`, {
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true
  })) as YtDlpSearchResult

  return (result.entries || [])
    .filter((entry) => entry.id && entry.title)
    .map((entry) => ({
      ...entry,
      webpage_url: entry.webpage_url || canonicalYoutubeUrl(entry.id || '')
    }))
}

async function pickVideoCandidate(
  plan: LearningPlan,
  lesson: Lesson | null,
  query: string,
  candidates: Array<YtDlpInfo & { reason?: string }>
): Promise<YtDlpInfo & { reason?: string }> {
  const parsed = await lawRagChatJson(
    [
      {
        role: 'system',
        content:
          'Chọn đúng 1 video YouTube phù hợp nhất cho người học từ danh sách ứng viên. Chỉ chọn theo index có sẵn, không bịa URL. Ưu tiên video giáo dục rõ ràng, đúng bài học, thời lượng hợp lý, có khả năng có transcript/caption. Trả về JSON {"index":0,"reason":"..."} bằng tiếng Việt.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          query,
          learner: {
            topic: plan.profile.topic,
            goal: plan.profile.goal,
            level: plan.profile.level,
            style: plan.profile.learningStyle,
            videoLanguage: plan.profile.videoLanguage === 'en' ? 'English' : 'Vietnamese'
          },
          lesson: lesson
            ? {
                title: lesson.title,
                objective: lesson.objective,
                checkpoint: lesson.checkpoint
              }
            : null,
          candidates: candidates.map((candidate, index) => ({
            index,
            title: candidate.title,
            durationMinutes: candidate.duration ? Math.round(candidate.duration / 60) : null,
            url: candidate.webpage_url
          }))
        })
      }
    ],
    0.2
  )

  const index = Number((parsed as { index?: unknown } | null)?.index)
  const reason = parsed && typeof (parsed as { reason?: unknown }).reason === 'string' ? (parsed as { reason: string }).reason.trim() : ''
  const candidate = Number.isInteger(index) && candidates[index] ? candidates[index] : candidates[0]
  return { ...candidate, reason }
}

async function getTranscript(info: YtDlpInfo, language: VideoLanguage): Promise<TranscriptItem[]> {
  const subtitleUrl = pickSubtitleUrl(info, language)
  if (!subtitleUrl) return []

  const response = await fetch(subtitleUrl)
  if (!response.ok) return []
  const text = await response.text()

  try {
    return parseJson3Transcript(JSON.parse(text))
  } catch {
    return parseVttTranscript(text)
  }
}

function pickSubtitleUrl(info: YtDlpInfo, language: VideoLanguage) {
  const requested = info.requested_subtitles ? Object.values(info.requested_subtitles).find((item) => item?.url) : null
  if (requested?.url) return requested.url

  const pools = [info.subtitles, info.automatic_captions]
  const preferredLanguages = language === 'en' ? ['en', 'en-US', 'en-GB', 'vi'] : ['vi', 'en', 'en-US', 'en-GB']
  for (const pool of pools) {
    if (!pool) continue
    for (const language of preferredLanguages) {
      const found = pickSubtitleFormat(pool[language])
      if (found) return found
    }
    for (const entries of Object.values(pool)) {
      const found = pickSubtitleFormat(entries)
      if (found) return found
    }
  }

  return null
}

function pickSubtitleFormat(entries: SubtitleInfo[] | undefined) {
  if (!entries?.length) return null
  return (entries.find((entry) => entry.ext === 'json3') || entries.find((entry) => entry.ext === 'vtt') || entries[0])?.url || null
}

function parseJson3Transcript(payload: { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> }): TranscriptItem[] {
  return (payload.events || [])
    .map((event) => {
      const text = (event.segs || []).map((segment) => segment.utf8 || '').join('').replace(/\s+/g, ' ').trim()
      if (!text) return null
      const startSeconds = Math.max(0, (event.tStartMs || 0) / 1000)
      const endSeconds = startSeconds + Math.max(1, (event.dDurationMs || 1000) / 1000)
      return { startSeconds, endSeconds, text }
    })
    .filter((item): item is TranscriptItem => Boolean(item))
}

function parseVttTranscript(content: string): TranscriptItem[] {
  const blocks = content.split(/\n\s*\n/)
  return blocks
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const timing = lines.find((line) => line.includes('-->'))
      if (!timing) return null
      const [start, end] = timing.split('-->').map((part) => part.trim().split(/\s+/)[0])
      const text = lines.filter((line) => !line.includes('-->') && !/^WEBVTT|Kind:|Language:/i.test(line)).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (!text) return null
      return { startSeconds: timestampToSeconds(start), endSeconds: timestampToSeconds(end), text }
    })
    .filter((item): item is TranscriptItem => Boolean(item))
}

function chunkTranscript(items: TranscriptItem[]): TranscriptItem[] {
  const chunks: TranscriptItem[] = []
  let current: TranscriptItem | null = null

  for (const item of items) {
    if (!current) {
      current = { ...item }
      continue
    }

    const nextText = `${current.text} ${item.text}`.trim()
    const duration = item.endSeconds - current.startSeconds
    if (duration <= 90 && nextText.length <= 900) {
      current = { startSeconds: current.startSeconds, endSeconds: item.endSeconds, text: nextText }
    } else {
      chunks.push(current)
      current = { ...item }
    }
  }

  if (current) chunks.push(current)
  return chunks.filter((chunk) => chunk.text.split(/\s+/).length >= 8).slice(0, 80)
}

async function titleTranscriptChunks(chunks: TranscriptItem[], videoTitle: string): Promise<Array<TranscriptItem & { title: string; summary: string }>> {
  const fallback = chunks.map((chunk, index) => ({
    ...chunk,
    title: `Đoạn ${index + 1}`,
    summary: 'Mở timestamp để xem nội dung chính của đoạn này.'
  }))

  const segments: unknown[] = []
  for (let offset = 0; offset < chunks.length; offset += 12) {
    const batch = chunks.slice(offset, offset + 12)
    const parsed = await lawRagChatJson(
      [
        {
          role: 'system',
          content:
            'Tóm tắt từng đoạn transcript video bằng tiếng Việt. Trả về JSON {"segments":[{"index":0,"title":"...","summary":"..."}]}. title tối đa 8 từ; summary 1 câu, tối đa 24 từ, dịch ý nếu transcript tiếng Anh, không chép nguyên phụ đề.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            videoTitle,
            chunks: batch.map((chunk, index) => ({
              index: offset + index,
              start: secondsToTimestamp(chunk.startSeconds),
              end: secondsToTimestamp(chunk.endSeconds),
              text: chunk.text.slice(0, 700)
            }))
          })
        }
      ],
      0.2
    )

    const batchSegments = parsed && Array.isArray((parsed as { segments?: unknown }).segments) ? (parsed as { segments: unknown[] }).segments : []
    for (const segment of batchSegments) segments.push(segment)
  }

  const byIndex = new Map<number, { title?: unknown; summary?: unknown }>()
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue
    const item = segment as { index?: unknown; title?: unknown; summary?: unknown }
    const index = Number(item.index)
    if (Number.isInteger(index)) byIndex.set(index, item)
  }

  return fallback.map((chunk, index) => {
    const segment = byIndex.get(index) || (segments[index] && typeof segments[index] === 'object' ? (segments[index] as { title?: unknown; summary?: unknown }) : null)
    const title = typeof segment?.title === 'string' && segment.title.trim() ? segment.title.trim() : chunk.title
    const summary = typeof segment?.summary === 'string' && segment.summary.trim() ? segment.summary.trim() : chunk.summary
    return { ...chunk, title: clampWords(title, 10), summary: clampWords(summary, 28) }
  })
}

function embedText(value: string) {
  const vector = new Array(256).fill(0)
  for (const token of tokenize(value)) {
    vector[hashToken(token) % vector.length] += 1
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1
  return vector.map((item) => item / norm)
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || []
}

function hashToken(token: string) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cosineSimilarity(left: number[], right: number[]) {
  return left.reduce((sum, item, index) => sum + item * (right[index] || 0), 0)
}

function clampWords(text: string, limit: number) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= limit) return text
  return `${words.slice(0, limit).join(' ')}...`
}

function withYoutubeStartTime(value: string, seconds: number) {
  const url = new URL(value)
  url.searchParams.set('t', `${Math.floor(seconds)}s`)
  return url.toString()
}

function canonicalYoutubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function timestampToSeconds(value: string) {
  const parts = value.replace(',', '.').split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function secondsToTimestamp(value: number) {
  const total = Math.max(0, Math.floor(value))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function stableId(value: string) {
  return `video-${hashToken(value).toString(16)}`
}
