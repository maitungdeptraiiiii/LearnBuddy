import { NextResponse } from 'next/server'
import { estimateRecommendedWeeks, generateFallbackPlan } from '@/lib/fallback-plan'
import { LEARNING_PLAN_SYSTEM_PROMPT } from '@/lib/learning-plan-prompt'
import { buildLearningPlanUserPrompt } from '@/lib/learning-plan-user-prompt'
import type { LearnerProfile, LearningPlan, Lesson, LessonStatus, PrerequisiteRelationship, RecommendedResource, ResourceLanguage, ResourceLevel, ResourceType } from '@/lib/types'
import { lawRagChatJson } from '@/lib/law-rag-llm'
import { enrichRecommendedResourceLinks, normalizeRecommendedResourceUrl } from '@/lib/recommended-resource-links'

export async function POST(request: Request) {
  const profile = (await request.json()) as LearnerProfile

  try {
    const parsed = await lawRagChatJson([
      {
        role: 'system',
        content: LEARNING_PLAN_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: buildLearningPlanUserPrompt(profile)
      }
    ])

    if (!parsed) {
      return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback' })
    }

    const plan = await normalizeLearningPlan(parsed, profile)
    if (hasRepeatedLessons(plan)) {
      return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback-quality-guard' })
    }

    return NextResponse.json({ plan, mode: 'law-rag-llm' })
  } catch {
    return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback' })
  }
}

function hasRepeatedLessons(plan: LearningPlan) {
  const seen = new Set<string>()
  for (const lesson of plan.lessons) {
    const key = `${lesson.title.trim().toLowerCase()}|${lesson.objective.trim().toLowerCase()}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

async function normalizeLearningPlan(parsed: unknown, profile: LearnerProfile): Promise<LearningPlan> {
  if (!parsed || typeof parsed !== 'object') return generateFallbackPlan(profile)

  const raw = parsed as Partial<LearningPlan>
  const normalizedLessons = Array.isArray(raw.lessons) ? await Promise.all(raw.lessons.map((lesson, index) => normalizeLesson(lesson, index, profile))) : []

  if (normalizedLessons.length === 0) return generateFallbackPlan(profile)

  const requestedWeeks = Math.max(1, Math.min(12, profile.durationWeeks || normalizedLessons.length))
  const recommendedWeeks = normalizeRecommendedWeeks(raw.recommendedWeeks, profile)
  const normalizedProfile = {
    ...profile,
    durationWeeks: requestedWeeks,
    learningTimePreference: normalizeLearningTimePreference(profile.learningTimePreference),
    videoLanguage: normalizeVideoLanguage(profile.videoLanguage)
  }
  const enrichedLessons = await enrichRecommendedResourceLinks(normalizedLessons, normalizedProfile, { refreshExisting: true })
  const lessons = rebalanceLessonDurations(enrichedLessons, normalizedProfile)

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : `Lộ trình học ${profile.topic}`,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : `Kế hoạch học cá nhân hóa cho mục tiêu: ${profile.goal}.`,
    prerequisites: normalizePrerequisites(raw.prerequisites),
    prerequisiteGraph: normalizePrerequisiteGraph(raw.prerequisiteGraph, normalizePrerequisites(raw.prerequisites), profile.topic),
    recommendedWeeks,
    durationAdvice: normalizeDurationAdvice(raw.durationAdvice, requestedWeeks, recommendedWeeks),
    profile: normalizedProfile,
    lessons
  }
}

function normalizeLearningTimePreference(value: unknown): LearnerProfile['learningTimePreference'] {
  if (value === 'morning' || value === 'noon' || value === 'afternoon' || value === 'evening') return value
  return 'evening'
}

function normalizeVideoLanguage(value: unknown): LearnerProfile['videoLanguage'] {
  if (value === 'en' || value === 'vi') return value
  return 'vi'
}

function normalizePrerequisites(value: unknown) {
  if (Array.isArray(value) && value.length > 0) return value.map(String).filter(Boolean)
  return ['Kiến thức nhập môn của chủ đề', 'Thuật ngữ cơ bản', 'Kỹ năng tự học và ghi chú', 'Một mục tiêu thực hành nhỏ']
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const normalized = value.map(String).map((item) => item.trim()).filter(Boolean)
    if (normalized.length > 0) return normalized
  }

  return fallback
}

function normalizePrerequisiteGraph(value: unknown, prerequisites: string[], topic: string): PrerequisiteRelationship[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const relationship = item as Partial<PrerequisiteRelationship>
        if (!relationship.from || !relationship.to) return null
        return {
          from: String(relationship.from),
          to: String(relationship.to),
          reason: relationship.reason ? String(relationship.reason) : `Cần học "${relationship.from}" trước "${relationship.to}".`
        }
      })
      .filter((item): item is PrerequisiteRelationship => Boolean(item))

    if (normalized.length > 0) return normalized
  }

  return prerequisites.map((item, index) => ({
    from: item,
    to: index === prerequisites.length - 1 ? topic : prerequisites[index + 1],
    reason: index === prerequisites.length - 1 ? `Cần nắm "${item}" trước khi học sâu vào ${topic}.` : `"${item}" giúp học "${prerequisites[index + 1]}" dễ hơn.`
  }))
}

function normalizeRecommendedWeeks(value: unknown, profile: LearnerProfile) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(12, Math.max(1, Math.round(parsed)))
  return estimateRecommendedWeeks(profile)
}

function normalizeDurationAdvice(value: unknown, selectedWeeks: number, recommendedWeeks: number) {
  if (typeof value === 'string' && value.trim()) return value
  if (selectedWeeks < recommendedWeeks) return 'Thời lượng ngắn hơn gợi ý: học lướt phần dễ/ít liên quan, ưu tiên nền tảng bắt buộc và phần khó.'
  if (selectedWeeks > recommendedWeeks) return 'Thời lượng dài hơn gợi ý: học kỹ hơn phần khó, thêm bài tập mở rộng và tự kiểm tra.'
  return 'Thời lượng phù hợp với gợi ý, có thể học đều từ nền tảng đến thực hành.'
}

async function normalizeLesson(rawLesson: unknown, index: number, profile: LearnerProfile): Promise<Lesson> {
  const lesson = rawLesson && typeof rawLesson === 'object' ? (rawLesson as Partial<Lesson>) : {}
  const fallbackTitle = `Bài ${index + 1}: ${profile.topic}`
  const title = typeof lesson.title === 'string' && lesson.title.trim() ? lesson.title : fallbackTitle

  return {
    id: typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id : `lesson-${index + 1}`,
    week: Number.isFinite(Number(lesson.week)) && Number(lesson.week) > 0 ? Number(lesson.week) : index + 1,
    pacing: normalizePacing(lesson.pacing, index, profile),
    title,
    objective: typeof lesson.objective === 'string' && lesson.objective.trim() ? lesson.objective : `Nắm nội dung chính của ${fallbackTitle}.`,
    durationMinutes:
      Number.isFinite(Number(lesson.durationMinutes)) && Number(lesson.durationMinutes) > 0 ? Number(lesson.durationMinutes) : Math.max(35, Math.round(profile.hoursPerWeek * 60)),
    activities: Array.isArray(lesson.activities) && lesson.activities.length > 0 ? lesson.activities.map(String) : [`Học nội dung chính về ${profile.topic}`, 'Làm bài tập ngắn'],
    homework: normalizeStringList(lesson.homework, [`Tóm tắt bài ${index + 1} bằng lời của bạn`, `Làm một bài tập nhỏ về ${profile.topic}`]),
    resources: normalizeStringList(lesson.resources, [`Tài liệu nhập môn về ${profile.topic}`, `Video/bài giảng liên quan đến ${fallbackTitle}`]),
    recommendedResources: normalizeRecommendedResources(lesson.recommendedResources, profile, title),
    checkpoint: typeof lesson.checkpoint === 'string' && lesson.checkpoint.trim() ? lesson.checkpoint : `Giải thích được nội dung chính của ${fallbackTitle}.`,
    quiz: Array.isArray(lesson.quiz) && lesson.quiz.length > 0 ? lesson.quiz.map(String) : ['Bạn đã hiểu điểm quan trọng nhất nào?'],
    status: normalizeStatus(lesson.status)
  }
}

function normalizePacing(pacing: unknown, index: number, profile: LearnerProfile) {
  if (pacing === 'skim' || pacing === 'deep' || pacing === 'normal') return pacing
  const recommendedWeeks = estimateRecommendedWeeks(profile)
  const selectedWeeks = Math.max(1, Math.min(12, profile.durationWeeks || recommendedWeeks))
  if (selectedWeeks < recommendedWeeks) return index === 0 || index === selectedWeeks - 1 ? 'deep' : index % 2 === 0 ? 'deep' : 'skim'
  if (selectedWeeks > recommendedWeeks) return index >= Math.max(1, selectedWeeks - 2) || index % 2 === 0 ? 'deep' : 'normal'
  return index === 0 || index === selectedWeeks - 1 ? 'deep' : 'normal'
}

function normalizeStatus(status: unknown): LessonStatus {
  if (status === 'doing' || status === 'done' || status === 'review') return status
  return 'todo'
}

function normalizeRecommendedResources(value: unknown, profile: LearnerProfile, lessonTitle: string): RecommendedResource[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeRecommendedResource(item, profile, lessonTitle))
    .filter((item): item is RecommendedResource => Boolean(item))
    .slice(0, 5)
}

function normalizeRecommendedResource(item: unknown, profile: LearnerProfile, lessonTitle: string): RecommendedResource | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Partial<RecommendedResource>
  const searchKeyword = typeof record.searchKeyword === 'string' && record.searchKeyword.trim() ? record.searchKeyword.trim() : `${profile.topic} ${lessonTitle} tutorial`

  return {
    type: normalizeResourceType(record.type),
    primaryLanguage: normalizeResourceLanguage(record.primaryLanguage, profile.videoLanguage),
    url: normalizeRecommendedResourceUrl(record.url),
    searchKeyword,
    englishKeywords: normalizeStringList(record.englishKeywords, [`${profile.topic} ${lessonTitle} explained`, `${profile.topic} ${lessonTitle} tutorial`]).slice(0, 6),
    vietnameseKeywords: normalizeStringList(record.vietnameseKeywords, [`giải thích ${profile.topic} ${lessonTitle}`, `hướng dẫn ${profile.topic} ${lessonTitle}`]).slice(0, 6),
    level: normalizeResourceLevel(record.level, profile.level),
    learningStyleFit: typeof record.learningStyleFit === 'string' && record.learningStyleFit.trim() ? record.learningStyleFit.trim() : `Phù hợp với phong cách học ${profile.learningStyle}.`,
    whyRecommended: typeof record.whyRecommended === 'string' && record.whyRecommended.trim() ? record.whyRecommended.trim() : `Từ khóa này bám sát lesson "${lessonTitle}".`
  }
}

function normalizeResourceType(value: unknown): ResourceType {
  if (value === 'video' || value === 'article' || value === 'documentation' || value === 'exercise' || value === 'project') return value
  return 'video'
}

function normalizeResourceLanguage(value: unknown, videoLanguage: LearnerProfile['videoLanguage']): ResourceLanguage {
  if (value === 'Vietnamese' || value === 'English') return value
  return videoLanguage === 'en' ? 'English' : 'Vietnamese'
}

function normalizeResourceLevel(value: unknown, level: string): ResourceLevel {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') return value
  if (level === 'advanced') return 'Advanced'
  if (level === 'intermediate') return 'Intermediate'
  return 'Beginner'
}

function rebalanceLessonDurations(lessons: Lesson[], profile: LearnerProfile) {
  if (lessons.length === 0) return lessons
  const totalMinutes = Math.max(lessons.length * 30, Math.round(profile.durationWeeks * profile.hoursPerWeek * 60))
  const weights = lessons.map((lesson) => (lesson.pacing === 'deep' ? 1.35 : lesson.pacing === 'skim' ? 0.65 : 1))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || lessons.length
  const durations = weights.map((weight) => Math.max(30, Math.round((totalMinutes * weight) / totalWeight / 5) * 5))
  const delta = totalMinutes - durations.reduce((sum, value) => sum + value, 0)
  durations[durations.length - 1] = Math.max(30, durations[durations.length - 1] + delta)
  return lessons.map((lesson, index) => ({ ...lesson, durationMinutes: durations[index] }))
}
