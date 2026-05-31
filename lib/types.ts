export type Pace = 'gentle' | 'normal' | 'intensive'
export type LearningStyle = 'concepts' | 'practice' | 'project' | 'mixed'
export type LessonStatus = 'todo' | 'doing' | 'done' | 'review'

export interface LearnerProfile {
  topic: string
  goal: string
  level: string
  durationWeeks: number
  hoursPerWeek: number
  pace: Pace
  learningStyle: LearningStyle
}

export interface Lesson {
  id: string
  week: number
  pacing?: 'skim' | 'deep' | 'normal'
  title: string
  objective: string
  durationMinutes: number
  activities: string[]
  checkpoint: string
  quiz: string[]
  status: LessonStatus
}

export interface LearningPlan {
  title: string
  summary: string
  prerequisites: string[]
  recommendedWeeks: number
  durationAdvice: string
  profile: LearnerProfile
  lessons: Lesson[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}
