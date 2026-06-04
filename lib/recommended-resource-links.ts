import type { LearnerProfile, Lesson } from '@/lib/types'
import { lawRagChatJson } from '@/lib/law-rag-llm'
import { RECOMMENDED_RESOURCE_LINK_SYSTEM_PROMPT } from '@/lib/recommended-resource-link-prompt'

type RecommendedResourceLinkCandidate = {
  id: string
  lessonId: string
  week: number
  lessonTitle: string
  objective: string
  checkpoint: string
  activities: string[]
  resourceIndex: number
  type: string
  primaryLanguage: string
  searchKeyword: string
  englishKeywords: string[]
  vietnameseKeywords: string[]
  learningStyleFit: string
  whyRecommended: string
  url: string
}

export async function enrichRecommendedResourceLinks(lessons: Lesson[], profile: LearnerProfile, options?: { refreshExisting?: boolean }) {
  const refreshExisting = Boolean(options?.refreshExisting)
  const candidates: RecommendedResourceLinkCandidate[] = lessons
    .flatMap((lesson) =>
      (lesson.recommendedResources || []).map((resource, index) => ({
        id: `${lesson.id}::${index}`,
        lessonId: lesson.id,
 
        week: lesson.week,
        lessonTitle: lesson.title,
        objective: lesson.objective,
        checkpoint: lesson.checkpoint,
        activities: lesson.activities.slice(0, 4),
        resourceIndex: index,
        type: resource.type,
        primaryLanguage: resource.primaryLanguage,
        searchKeyword: resource.searchKeyword,
        englishKeywords: resource.englishKeywords,
        vietnameseKeywords: resource.vietnameseKeywords,
        learningStyleFit: resource.learningStyleFit,
        whyRecommended: resource.whyRecommended,
        url: resource.url || ''
      }))
    )
    .filter((resource) => refreshExisting || !resource.url)
  const candidateIds = new Set(candidates.map((candidate) => candidate.id))

  if (!candidates.length) return lessons

  const urlMap = await requestRecommendedResourceUrlMap(candidates, profile)
  const validated = await validateRecommendedResourceUrlMap(urlMap, candidates)
  let finalUrlMap = validated.urlMap

  if (validated.rejected.length > 0) {
    const retryCandidates = validated.rejected.map((item) => item.candidate)
    const retryUrlMap = await requestRecommendedResourceUrlMap(retryCandidates, profile, validated.rejected)
    const retryValidated = await validateRecommendedResourceUrlMap(retryUrlMap, retryCandidates)
    finalUrlMap = new Map([...finalUrlMap, ...retryValidated.urlMap])
  }

  if (!finalUrlMap.size) return lessons

  return lessons.map((lesson) => ({
    ...lesson,
    recommendedResources: (lesson.recommendedResources || []).map((resource, index) => ({
      ...resource,
      url: candidateIds.has(`${lesson.id}::${index}`) ? finalUrlMap.get(`${lesson.id}::${index}`) || undefined : resource.url || undefined
    }))
  }))
}

async function requestRecommendedResourceUrlMap(
  candidates: RecommendedResourceLinkCandidate[],
  profile: LearnerProfile,
  rejected?: Array<{ candidate: RecommendedResourceLinkCandidate; reason: string }>
) {
  const rejectionHints = rejected?.length
    ? rejected.map((item) => ({ id: item.candidate.id, rejectedReason: item.reason, previousUrl: item.candidate.url || '' }))
    : []

  const enriched = await lawRagChatJson(
    [
      {
        role: 'system',
        content: RECOMMENDED_RESOURCE_LINK_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: profile.topic,
          goal: profile.goal,
          preferredLanguage: profile.videoLanguage,
          instruction:
            'Chỉ chọn link nếu nó phù hợp trực tiếp với lessonTitle, objective và checkpoint của tuần. Nếu không chắc, để trống. Nếu một link trước đó đã bị từ chối thì phải tránh lặp lại đúng kiểu lỗi đó.',
          rejectedLinks: rejectionHints,
          resources: candidates
        })
      }
    ],
    0.2
  )

  const urlMap = new Map<string, string>()
  const items = enriched && Array.isArray((enriched as { resources?: unknown[] }).resources) ? (enriched as { resources: unknown[] }).resources : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    const url = normalizeRecommendedResourceUrl(record.url)
    if (id && url) urlMap.set(id, url)
  }
  return urlMap
}

async function validateRecommendedResourceUrlMap(urlMap: Map<string, string>, candidates: RecommendedResourceLinkCandidate[]) {
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const rawUrl = urlMap.get(candidate.id)
      if (!rawUrl) return { candidate, url: '', reason: 'missing-url' }
      const validation = await validateRecommendedResourceUrl(rawUrl, candidate)
      return { candidate, url: validation.url || '', reason: validation.reason }
    })
  )

  return {
    urlMap: new Map(results.filter((item) => item.url).map((item) => [item.candidate.id, item.url] as const)),
    rejected: results.filter((item) => !item.url && item.reason !== 'missing-url').map((item) => ({ candidate: item.candidate, reason: item.reason }))
  }
}

async function validateRecommendedResourceUrl(url: string, candidate: RecommendedResourceLinkCandidate) {
  const normalized = normalizeRecommendedResourceUrl(url)
  if (!normalized) return { reason: 'invalid-url' }

  if (isKnownGenericResourceUrl(normalized)) return { reason: 'generic-url' }

  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.toLowerCase()

    if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'youtu.be') {
      const title = await fetchYoutubeOEmbedTitle(normalized)
      if (!title) return { reason: 'dead-video' }
      return matchesLessonKeywords(title.toLowerCase(), candidate) ? { url: normalized, reason: 'ok' } : { reason: 'weak-match' }
    }

    const response = await fetch(normalized, { redirect: 'follow' })
    if (!response.ok) return { reason: `http-${response.status}` }

    const finalUrl = normalizeRecommendedResourceUrl(response.url)
    if (!finalUrl || isKnownGenericResourceUrl(finalUrl)) return { reason: 'generic-url' }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('text/html')) return { url: finalUrl, reason: 'ok' }

    const html = (await response.text()).slice(0, 120000)
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()

    if (looksLikeMissingPage(text)) return { reason: 'missing-page' }
    if (isTooGenericPage(finalUrl, text)) return { reason: 'generic-page' }
    if (!matchesLessonKeywords(text, candidate)) return { reason: 'weak-match' }

    return { url: finalUrl, reason: 'ok' }
  } catch {
    return { reason: 'fetch-failed' }
  }
}

async function fetchYoutubeOEmbedTitle(url: string) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
    if (!response.ok) return ''
    const payload = (await response.json()) as { title?: string }
    return typeof payload.title === 'string' ? payload.title.trim() : ''
  } catch {
    return ''
  }
}

function looksLikeMissingPage(text: string) {
  return [
    'page not found',
    'whoops, that page is gone',
    '404 error',
    'error 404',
    'the page you requested could not be found',
    'this page could not be found'
  ].some((pattern) => text.includes(pattern))
}

function isKnownGenericResourceUrl(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/'

    if (host === 'www.kaggle.com' && (path === '/code' || path === '/learn' || path === '/datasets')) return true
    if (host === 'www.youtube.com' && (path === '/results' || path.startsWith('/@') || path.startsWith('/channel/'))) return true
    if (host === 'youtube.com' && (path === '/results' || path.startsWith('/@') || path.startsWith('/channel/'))) return true
    if (host.endsWith('scikit-learn.org') && (path === '/stable' || path === '/stable/' || path === '/stable/index.html')) return true
    return false
  } catch {
    return true
  }
}

function isTooGenericPage(url: string, text: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/'

    if (host === 'www.kaggle.com' && (path === '/code' || path === '/datasets')) return true
    if (host.endsWith('kaggle.com') && text.includes('explore and run machine learning code with kaggle notebooks')) return true
    if (path === '/' && text.length < 4000) return true
    return false
  } catch {
    return true
  }
}

function matchesLessonKeywords(text: string, candidate: RecommendedResourceLinkCandidate) {
  const keywordPool = [candidate.searchKeyword, ...candidate.englishKeywords, candidate.lessonTitle, candidate.objective, candidate.checkpoint, ...candidate.vietnameseKeywords]
  const keywords = Array.from(
    new Set(
      keywordPool
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter((token) => (token.length >= 4 || IMPORTANT_SHORT_KEYWORDS.has(token)) && !COMMON_RESOURCE_STOPWORDS.has(token))
    )
  ).slice(0, 12)

  if (!keywords.length) return true
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const matches = keywords.filter((token) => normalizedText.includes(token)).length
  return matches >= Math.min(2, keywords.length)
}

const IMPORTANT_SHORT_KEYWORDS = new Set(['nlp', 'tfidf', 'bow', 'ner', 'nltk', 'bert', 'rnn'])

const COMMON_RESOURCE_STOPWORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'what',
  'when',
  'where',
  'which',
  'your',
  'have',
  'will',
  'about',
  'using',
  'into',
  'bài',
  'tuần',
  'mục',
  'tiêu',
  'học',
  'được',
  'những',
  'với',
  'cách',
  'trong',
  'text',
  'data'
])

export function normalizeRecommendedResourceUrl(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return undefined

  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    if (host.includes('google.') && path === '/search') return undefined
    if ((host === 'www.youtube.com' || host === 'youtube.com') && path === '/results') return undefined
    if (host === 'www.bing.com' && path === '/search') return undefined
    if (host === 'search.yahoo.com') return undefined

    return parsed.toString()
  } catch {
    return undefined
  }
}