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
  description?: string
  duration?: number
  webpage_url?: string
  http_headers?: Record<string, string>
  chapters?: Array<{
    title?: string
    start_time?: number
    end_time?: number
  }>
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
  const transcriptChunks = transcript.length > 0 ? chunkTranscript(transcript) : []
  const useTranscript = transcriptChunks.length > 0
  const chunks = useTranscript ? transcriptChunks : chapterTranscriptItems(info)

  if (chunks.length === 0) {
    throw new Error('Video này không có caption/transcript public và cũng không có chapter timestamp để phân tích. Hãy chọn video có phụ đề công khai, auto-caption, hoặc chapter.')
  }

  const titledChunks = useTranscript ? await titleTranscriptChunks(chunks, info.title || 'YouTube video') : titleChapterChunks(chunks)
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

export async function suggestYoutubeVideo(plan: LearningPlan, lesson: Lesson | null, excludedUrls: string[] = []): Promise<VideoRecommendation> {
  const query = await buildVideoSearchQuery(plan, lesson)
  const excluded = new Set(excludedUrls.map(normalizeVideoUrlForComparison).filter(Boolean))
  const allCandidates = await searchYoutubeCandidates(query, 24)
  const distinctCandidates = allCandidates.filter((candidate) => !excluded.has(normalizeVideoUrlForComparison(candidate.webpage_url || canonicalYoutubeUrl(candidate.id || ''))))
  const candidates = distinctCandidates.length > 0 ? distinctCandidates : allCandidates

  if (candidates.length === 0) {
    throw new Error('Không tìm được video YouTube phù hợp.')
  }

  const picked = await pickVideoCandidate(plan, lesson, query, candidates)
  const fallbackReason =
    distinctCandidates.length === 0 && excluded.size > 0
      ? 'Không tìm được video khác đủ phù hợp trong kết quả YouTube hiện tại, nên hệ thống chọn kết quả sát bài học nhất.'
      : ''
  return {
    title: picked.title || 'YouTube video',
    url: picked.webpage_url || canonicalYoutubeUrl(picked.id || ''),
    durationMinutes: Math.max(1, Math.round((picked.duration || 60) / 60)),
    reason: fallbackReason || picked.reason || `Phù hợp với bài "${lesson?.title || plan.title}".`,
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
  const resourceKeywords = (lesson.recommendedResources || []).flatMap((resource) => [
    resource.searchKeyword,
    ...resource.englishKeywords,
    ...resource.vietnameseKeywords,
    resource.whyRecommended,
    resource.learningStyleFit
  ])
  return [lesson.title, lesson.objective, lesson.checkpoint, ...lesson.activities, ...lesson.homework, ...lesson.resources, ...resourceKeywords, ...lesson.quiz].join('\n')
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

function chapterTranscriptItems(info: YtDlpInfo): Array<TranscriptItem & { title: string; summary: string }> {
  const chapters = (info.chapters || [])
    .map((chapter, index, items) => {
      const startSeconds = Math.max(0, Number(chapter.start_time) || 0)
      const fallbackEnd = items[index + 1]?.start_time || info.duration || startSeconds + 60
      const endSeconds = Math.max(startSeconds + 1, Number(chapter.end_time) || Number(fallbackEnd) || startSeconds + 60)
      const title = chapter.title?.trim() || `Đoạn ${index + 1}`
      return {
        startSeconds,
        endSeconds,
        title,
        summary: 'Video không có transcript public; timestamp này lấy từ chapter của YouTube.',
        text: `${title}. ${info.title || ''}. ${info.description || ''}`.slice(0, 900)
      }
    })
    .filter((chapter) => chapter.endSeconds > chapter.startSeconds)

  return chapters.slice(0, 80)
}

function titleChapterChunks(chunks: Array<TranscriptItem & { title?: string; summary?: string }>) {
  return chunks.map((chunk, index) => ({
    ...chunk,
    title: chunk.title || `Đoạn ${index + 1}`,
    summary: chunk.summary || 'Timestamp lấy từ chapter của YouTube.'
  }))
}

async function buildVideoSearchQuery(plan: LearningPlan, lesson: Lesson | null) {
  const languageLabel = plan.profile.videoLanguage === 'en' ? 'English' : 'Vietnamese'
  const fallback = lesson
    ? `${plan.profile.topic} ${lesson.title} ${lesson.objective} ${plan.profile.level} ${languageLabel} tutorial`
    : `${plan.profile.topic} ${plan.profile.goal} ${plan.profile.level} ${languageLabel} tutorial`
  const parsed = await lawRagChatJson(
    [
      {
        role: 'system',
        content:
          'Tạo một truy vấn YouTube ngắn, cụ thể cho đúng bài học hiện tại. Trả về JSON {"query":"..."}. Query phải có chủ đề chính, trình độ, trọng tâm riêng của lesson, và từ khóa tutorial/lesson nếu phù hợp. Tránh query quá rộng kiểu complete course/full course nếu đang tìm video cho một tuần cụ thể. Không trả URL.'
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
                week: lesson.week,
                title: lesson.title,
                objective: lesson.objective,
                checkpoint: lesson.checkpoint,
                activities: lesson.activities,
                homework: lesson.homework
              }
            : null,
          allLessons: plan.lessons.map((item) => ({
            week: item.week,
            title: item.title,
            objective: item.objective
          }))
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

  const seen = new Set<string>()
  return (result.entries || [])
    .filter((entry) => entry.id && entry.title)
    .map((entry) => ({
      ...entry,
      webpage_url: entry.webpage_url || canonicalYoutubeUrl(entry.id || '')
    }))
    .filter((entry) => {
      const key = normalizeVideoUrlForComparison(entry.webpage_url || canonicalYoutubeUrl(entry.id || ''))
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
          'Chọn đúng 1 video YouTube phù hợp nhất cho lesson hiện tại từ danh sách ứng viên. Chỉ chọn theo index có sẵn, không bịa URL. Ưu tiên video giáo dục rõ ràng, đúng trọng tâm riêng của lesson, đúng trình độ, thời lượng hợp lý, có khả năng có transcript/caption. Tránh chọn video quá tổng quát hoặc full course nếu lesson chỉ cần một chủ đề hẹp. Trả về JSON {"index":0,"reason":"..."} bằng tiếng Việt.'
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
                week: lesson.week,
                title: lesson.title,
                objective: lesson.objective,
                checkpoint: lesson.checkpoint,
                activities: lesson.activities,
                homework: lesson.homework
              }
            : null,
          neighboringLessons: plan.lessons
            .filter((item) => !lesson || Math.abs(item.week - lesson.week) <= 1)
            .map((item) => ({
              week: item.week,
              title: item.title,
              objective: item.objective
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

  const index = Number((parsed as { index?: unknown } | null)?.index)
  const reason = parsed && typeof (parsed as { reason?: unknown }).reason === 'string' ? (parsed as { reason: string }).reason.trim() : ''
  const candidate = Number.isInteger(index) && candidates[index] ? candidates[index] : candidates[0]
  return { ...candidate, reason }
}

async function getTranscript(info: YtDlpInfo, language: VideoLanguage): Promise<TranscriptItem[]> {
  const subtitleUrl = pickSubtitleUrl(info, language)
  if (!subtitleUrl) return []

  const response = await fetch(subtitleUrl, {
    headers: {
      'user-agent': info.http_headers?.['User-Agent'] || 'Mozilla/5.0',
      accept: info.http_headers?.Accept || '*/*',
      'accept-language': info.http_headers?.['Accept-Language'] || (language === 'en' ? 'en-US,en;q=0.9' : 'vi,en-US;q=0.8,en;q=0.7')
    }
  })
  if (!response.ok) {
    return []
  }
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

function normalizeVideoUrlForComparison(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')
    const videoId = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v')
    if (videoId) return `youtube:${videoId}`
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.trim().toLowerCase()
  }
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
