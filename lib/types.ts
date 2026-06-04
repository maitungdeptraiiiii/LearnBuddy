export type Pace = 'gentle' | 'normal' | 'intensive'
export type LearningStyle = 'concepts' | 'practice' | 'project' | 'mixed'
export type LessonStatus = 'todo' | 'doing' | 'done' | 'review'
export type LearningTimePreference = 'morning' | 'noon' | 'afternoon' | 'evening'
export type VideoLanguage = 'vi' | 'en'

export interface LearnerProfile {
  topic: string
  goal: string
  level: string
  durationWeeks: number
  hoursPerWeek: number
  pace: Pace
  learningStyle: LearningStyle
  learningTimePreference: LearningTimePreference
  videoLanguage: VideoLanguage
}

export interface Lesson {
  id: string
  week: number
  pacing?: 'skim' | 'deep' | 'normal'
  title: string
  objective: string
  durationMinutes: number
  activities: string[]
  homework: string[]
  resources: string[]
  checkpoint: string
  quiz: string[]
  status: LessonStatus
}

export interface VideoTranscriptSegment {
  id: string
  startSeconds: number
  endSeconds: number
  title: string
  summary: string
  text: string
  embedding: number[]
}

export interface VideoIndex {
  id: string
  url: string
  title: string
  durationMinutes: number
  segments: VideoTranscriptSegment[]
}

export interface VideoSearchMatch extends VideoTranscriptSegment {
  score: number
  url: string
  videoTitle: string
}

export interface VideoRecommendation {
  title: string
  url: string
  durationMinutes: number
  reason: string
  query: string
  scope?: 'plan' | 'lesson'
}

export interface VideoAnalysis {
  video: VideoIndex
  matchesByLessonId: Record<string, VideoSearchMatch[]>
}

export interface PrerequisiteRelationship {
  from: string
  to: string
  reason: string
}

export interface LearningPlan {
  title: string
  summary: string
  prerequisites: string[]
  prerequisiteGraph: PrerequisiteRelationship[]
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
