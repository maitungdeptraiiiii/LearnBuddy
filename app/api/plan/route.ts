import { NextResponse } from 'next/server'
import { estimateRecommendedWeeks, generateFallbackPlan } from '@/lib/fallback-plan'
import type { LearnerProfile, LearningPlan, Lesson, LessonStatus } from '@/lib/types'
import { lawRagChatJson } from '@/lib/law-rag-llm'

export async function POST(request: Request) {
  const profile = (await request.json()) as LearnerProfile

  try {
    const parsed = await lawRagChatJson([
      {
        role: 'system',
        content:
          'You generate personalized learning plans in Vietnamese. The plan must change when topic, goal, level, duration, pace, or learningStyle changes. For every topic, identify prerequisite foundational knowledge. Recommend a suitable number of weeks as recommendedWeeks, but returned lessons must follow the learner requested durationWeeks with one lesson per requested week. If requested durationWeeks is shorter than recommendedWeeks, include durationAdvice that suggests skimming easy/less important parts and prioritizing difficult/foundational parts. If requested durationWeeks is longer than recommendedWeeks, include durationAdvice that suggests studying difficult parts more deeply with extra practice. Week 1 must cover prerequisite/foundation review. Do not repeat lesson titles, objectives, activities, checkpoints, or quizzes across weeks. Return strict JSON with title, summary, prerequisites, recommendedWeeks, durationAdvice, and lessons. Each lesson must include id, week, pacing, title, objective, durationMinutes, activities, checkpoint, quiz, status. pacing must be one of skim, deep, normal.'
      },
      {
        role: 'user',
        content: JSON.stringify({ profile })
      }
    ])

    if (!parsed) {
      return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback' })
    }

    const plan = normalizeLearningPlan(parsed, profile)
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

function normalizeLearningPlan(parsed: unknown, profile: LearnerProfile): LearningPlan {
  if (!parsed || typeof parsed !== 'object') return generateFallbackPlan(profile)

  const raw = parsed as Partial<LearningPlan>
  const lessons = Array.isArray(raw.lessons) ? raw.lessons.map((lesson, index) => normalizeLesson(lesson, index, profile)) : []

  if (lessons.length === 0) return generateFallbackPlan(profile)

  const requestedWeeks = Math.max(1, Math.min(12, profile.durationWeeks || lessons.length))
  const recommendedWeeks = normalizeRecommendedWeeks(raw.recommendedWeeks, profile)

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : `Lộ trình học ${profile.topic}`,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : `Kế hoạch học cá nhân hóa cho mục tiêu: ${profile.goal}.`,
    prerequisites: normalizePrerequisites(raw.prerequisites),
    recommendedWeeks,
    durationAdvice: normalizeDurationAdvice(raw.durationAdvice, requestedWeeks, recommendedWeeks),
    profile: { ...profile, durationWeeks: requestedWeeks },
    lessons
  }
}

function normalizePrerequisites(value: unknown) {
  if (Array.isArray(value) && value.length > 0) return value.map(String).filter(Boolean)
  return ['Kiến thức nhập môn của chủ đề', 'Thuật ngữ cơ bản', 'Kỹ năng tự học và ghi chú', 'Một mục tiêu thực hành nhỏ']
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

function normalizeLesson(rawLesson: unknown, index: number, profile: LearnerProfile): Lesson {
  const lesson = rawLesson && typeof rawLesson === 'object' ? (rawLesson as Partial<Lesson>) : {}
  const fallbackTitle = `Bài ${index + 1}: ${profile.topic}`

  return {
    id: typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id : `lesson-${index + 1}`,
    week: Number.isFinite(Number(lesson.week)) && Number(lesson.week) > 0 ? Number(lesson.week) : index + 1,
    pacing: normalizePacing(lesson.pacing, index, profile),
    title: typeof lesson.title === 'string' && lesson.title.trim() ? lesson.title : fallbackTitle,
    objective: typeof lesson.objective === 'string' && lesson.objective.trim() ? lesson.objective : `Nắm nội dung chính của ${fallbackTitle}.`,
    durationMinutes:
      Number.isFinite(Number(lesson.durationMinutes)) && Number(lesson.durationMinutes) > 0 ? Number(lesson.durationMinutes) : Math.max(35, Math.round(profile.hoursPerWeek * 60)),
    activities: Array.isArray(lesson.activities) && lesson.activities.length > 0 ? lesson.activities.map(String) : [`Học nội dung chính về ${profile.topic}`, 'Làm bài tập ngắn'],
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
