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
          'You generate personalized learning plans in Vietnamese. The plan must change when topic, goal, level, duration, pace, or learningStyle changes. For every topic, identify prerequisite foundational knowledge the learner should have. Recommend a suitable number of weeks based on topic difficulty, learner level, goal, pace, and hours per week; you may increase the requested duration if it is too short. Use one lesson per week. Week 1 must cover prerequisite/foundation review. Do not repeat lesson titles, objectives, activities, checkpoints, or quizzes across weeks. Return strict JSON with title, summary, prerequisites, recommendedWeeks, and lessons. Each lesson must include id, week, title, objective, durationMinutes, activities, checkpoint, quiz, status.'
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
    if (hasRepeatedLessons(plan) || hasInsufficientDuration(plan, profile)) {
      return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback-quality-guard' })
    }

    return NextResponse.json({ plan, mode: 'law-rag-llm' })
  } catch {
    return NextResponse.json({ plan: generateFallbackPlan(profile), mode: 'fallback' })
  }
}

function hasInsufficientDuration(plan: LearningPlan, profile: LearnerProfile) {
  const minimumWeeks = estimateRecommendedWeeks(profile)
  return plan.recommendedWeeks < minimumWeeks || plan.lessons.length < minimumWeeks
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

  const recommendedWeeks = normalizeRecommendedWeeks(raw.recommendedWeeks, lessons.length, profile)

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : `Lộ trình học ${profile.topic}`,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : `Kế hoạch học cá nhân hóa cho mục tiêu: ${profile.goal}.`,
    prerequisites: normalizePrerequisites(raw.prerequisites),
    recommendedWeeks,
    profile: { ...profile, durationWeeks: recommendedWeeks },
    lessons
  }
}

function normalizePrerequisites(value: unknown) {
  if (Array.isArray(value) && value.length > 0) return value.map(String).filter(Boolean)
  return ['Kiến thức nhập môn của chủ đề', 'Thuật ngữ cơ bản', 'Kỹ năng tự học và ghi chú', 'Một mục tiêu thực hành nhỏ']
}

function normalizeRecommendedWeeks(value: unknown, lessonCount: number, profile: LearnerProfile) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(lessonCount, Math.min(12, Math.round(parsed)))
  return Math.max(lessonCount, profile.durationWeeks || lessonCount)
}

function normalizeLesson(rawLesson: unknown, index: number, profile: LearnerProfile): Lesson {
  const lesson = rawLesson && typeof rawLesson === 'object' ? (rawLesson as Partial<Lesson>) : {}
  const fallbackTitle = `Bài ${index + 1}: ${profile.topic}`

  return {
    id: typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id : `lesson-${index + 1}`,
    week: Number.isFinite(Number(lesson.week)) && Number(lesson.week) > 0 ? Number(lesson.week) : index + 1,
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

function normalizeStatus(status: unknown): LessonStatus {
  if (status === 'doing' || status === 'done' || status === 'review') return status
  return 'todo'
}
