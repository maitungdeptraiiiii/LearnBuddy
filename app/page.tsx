'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileQuestion,
  GripVertical,
  Link,
  Loader2,
  MessageSquareText,
  PlaySquare,
  RotateCcw,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { ChatMessage, LearnerProfile, LearningPlan, Lesson, LessonQuiz, LessonStatus, QuizQuestion, VideoAnalysis, VideoRecommendation, VideoSearchMatch } from '@/lib/types'

const initialProfile: LearnerProfile = {
  topic: 'Python cơ bản',
  goal: 'Làm được một project nhỏ sau khóa học',
  level: 'beginner',
  durationWeeks: 4,
  hoursPerWeek: 5,
  pace: 'normal',
  learningStyle: 'mixed',
  learningTimePreference: 'evening',
  videoLanguage: 'vi'
}
const blankProfile: LearnerProfile = { ...initialProfile, topic: '', goal: '' }

const statusLabel: Record<LessonStatus, string> = {
  todo: 'Chưa học',
  doing: 'Đang học',
  done: 'Hoàn thành',
  review: 'Cần ôn'
}

const scheduleDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const scheduleSlots = ['07:00', '08:30', '10:00', '12:00', '14:00', '15:30', '17:00', '19:00', '20:30']
const dayTimelineSlots = Array.from({ length: 18 }, (_, index) => `${String(index + 6).padStart(2, '0')}:00`)
const monthDayVisibleEventLimit = 3
const scheduleBaseMonday = startOfWeek(new Date())
const preferredScheduleStart = {
  morning: '07:00',
  noon: '12:00',
  afternoon: '14:00',
  evening: '19:00'
} satisfies Record<LearnerProfile['learningTimePreference'], string>

const storageKey = 'learnmate-app-state-v2'
const quizStorageVersion = 2

type AppView = 'plan' | 'schedule' | 'videos' | 'quiz' | 'chat'
type CalendarViewMode = 'month' | 'week' | 'day'
type ChatHistoryByLesson = Record<string, ChatMessage[]>
type ChatSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}
type ChatSessionsByLesson = Record<string, ChatSession[]>
type ScheduleEvent = {
  id: string
  planId?: string
  planTitle?: string
  lessonId: string
  week: number
  title: string
  day: string
  start: string
  end: string
  kind: 'study' | 'review' | 'practice' | 'revision'
  note?: string
  status?: 'planned' | 'done' | 'skipped'
}
const scheduleKindOptions: Array<{ id: ScheduleEvent['kind']; label: string }> = [
  { id: 'study', label: 'Bài học' },
  { id: 'review', label: 'Quiz' },
  { id: 'practice', label: 'Thực hành' },
  { id: 'revision', label: 'Ôn tập' }
]
type ChatTopic = {
  id: string
  topic: string
  goal: string
  title: string
  profile: LearnerProfile
  lessons: Lesson[]
}
type DuplicatePlanPrompt = {
  profile: LearnerProfile
  existingPlan: LearningPlan
}

type PersistedAppState = {
  profile: LearnerProfile
  plan: LearningPlan | null
  savedPlans: LearningPlan[]
  selectedLessonId: string | null
  activeVideoPlanId?: string | null
  activeVideoLessonId: string | null
  youtubeUrlByLesson: Record<string, string>
  videoAnalysisByLesson: Record<string, VideoAnalysis>
  videoRecommendationByLesson: Record<string, VideoRecommendation>
  quizByLesson: Record<string, LessonQuiz>
  quizAnswersByLesson: Record<string, Record<string, number>>
  quizSubmittedByLesson?: Record<string, boolean>
  quizStorageVersion?: number
  youtubeUrl?: string
  videoAnalysis?: VideoAnalysis | null
  videoRecommendation?: VideoRecommendation | null
  scheduleEvents: ScheduleEvent[]
  activeScheduleWeek: number
  activeSchedulePlanId?: string | null
  chatTopics: ChatTopic[]
  chatHistoryByLesson: ChatHistoryByLesson
  chatSessionsByLesson?: ChatSessionsByLesson
  activeChatSessionIdByLesson?: Record<string, string>
}

export default function Home() {
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile)
  const [plan, setPlan] = useState<LearningPlan | null>(null)
  const [view, setView] = useState<AppView>('plan')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [activeScheduleWeek, setActiveScheduleWeek] = useState(1)
  const [activeSchedulePlanId, setActiveSchedulePlanId] = useState<string | null>(null)
  const [calendarMonthDate, setCalendarMonthDate] = useState(startOfMonth(new Date()))
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(new Date())
  const [editingScheduleEvent, setEditingScheduleEvent] = useState<ScheduleEvent | null>(null)
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('month')
  const [scheduleCourseFilters, setScheduleCourseFilters] = useState<Record<string, boolean>>({})
  const [scheduleKindFilters, setScheduleKindFilters] = useState<Record<ScheduleEvent['kind'], boolean>>({
    study: true,
    review: true,
    practice: true,
    revision: true
  })
  const [activeVideoPlanId, setActiveVideoPlanId] = useState<string | null>(null)
  const [activeVideoLessonId, setActiveVideoLessonId] = useState<string | null>(null)
  const [youtubeUrlByLesson, setYoutubeUrlByLesson] = useState<Record<string, string>>({})
  const [videoAnalysisByLesson, setVideoAnalysisByLesson] = useState<Record<string, VideoAnalysis>>({})
  const [videoRecommendationByLesson, setVideoRecommendationByLesson] = useState<Record<string, VideoRecommendation>>({})
  const [videoPlayerStartByLesson, setVideoPlayerStartByLesson] = useState<Record<string, number>>({})
  const [quizByLesson, setQuizByLesson] = useState<Record<string, LessonQuiz>>({})
  const [quizAnswersByLesson, setQuizAnswersByLesson] = useState<Record<string, Record<string, number>>>({})
  const [quizSubmittedByLesson, setQuizSubmittedByLesson] = useState<Record<string, boolean>>({})
  const [activeQuizSessionLessonId, setActiveQuizSessionLessonId] = useState<string | null>(null)
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false)
  const [isSuggestingVideo, setIsSuggestingVideo] = useState(false)
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false)
  const [isProcessingVideoBatch, setIsProcessingVideoBatch] = useState(false)
  const [videoBatchStatus, setVideoBatchStatus] = useState('')
  const [videoError, setVideoError] = useState('')
  const [activeChatTopicId, setActiveChatTopicId] = useState<string | null>(null)
  const [activeChatLessonId, setActiveChatLessonId] = useState<string | null>(null)
  const [chatTopics, setChatTopics] = useState<ChatTopic[]>([])
  const [chatHistoryByLesson, setChatHistoryByLesson] = useState<ChatHistoryByLesson>({})
  const [chatSessionsByLesson, setChatSessionsByLesson] = useState<ChatSessionsByLesson>({})
  const [activeChatSessionIdByLesson, setActiveChatSessionIdByLesson] = useState<Record<string, string>>({})
  const [question, setQuestion] = useState('')
  const [profileError, setProfileError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [savedPlans, setSavedPlans] = useState<LearningPlan[]>([])
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planDeleteCandidate, setPlanDeleteCandidate] = useState<LearningPlan | null>(null)
  const [duplicatePlanPrompt, setDuplicatePlanPrompt] = useState<DuplicatePlanPrompt | null>(null)
  const [isTopicInputFocused, setIsTopicInputFocused] = useState(false)
  const [expandedScheduleTopicIds, setExpandedScheduleTopicIds] = useState<Record<string, boolean>>({})
  const [expandedVideoTopicIds, setExpandedVideoTopicIds] = useState<Record<string, boolean>>({})
  const [expandedQuizTopicIds, setExpandedQuizTopicIds] = useState<Record<string, boolean>>({})
  const [expandedChatTopicIds, setExpandedChatTopicIds] = useState<Record<string, boolean>>({})
  const autoSuggestedVideoKeysRef = useRef<Set<string>>(new Set())
  const enrichedResourcePlanIdsRef = useRef<Set<string>>(new Set())
  const monthDragSwitchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatLogRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const selectedLesson = useMemo(
    () => plan?.lessons.find((lesson) => lesson.id === selectedLessonId) || plan?.lessons[0] || null,
    [plan, selectedLessonId]
  )

  const selectedChatTopic = useMemo(() => chatTopics.find((topic) => topic.id === activeChatTopicId) || null, [chatTopics, activeChatTopicId])
  const selectedChatLesson = useMemo(
    () => selectedChatTopic?.lessons.find((lesson) => lesson.id === activeChatLessonId) || selectedChatTopic?.lessons[0] || null,
    [selectedChatTopic, activeChatLessonId]
  )
  const schedulePlans = useMemo(() => {
    const plans = plan ? upsertSavedPlan(savedPlans, plan) : savedPlans
    return plans.map(normalizeLoadedPlan)
  }, [savedPlans, plan])
  const activeVideoPlan = useMemo(
    () => schedulePlans.find((item) => planStorageId(item) === activeVideoPlanId) || schedulePlans[0] || null,
    [schedulePlans, activeVideoPlanId]
  )
  const activeVideoLesson = useMemo(
    () => activeVideoPlan?.lessons.find((lesson) => lesson.id === activeVideoLessonId) || activeVideoPlan?.lessons[0] || null,
    [activeVideoPlan, activeVideoLessonId]
  )
  const activeVideoStateKey = activeVideoPlan && activeVideoLesson ? videoStateKey(activeVideoPlan, activeVideoLesson) : ''
  const youtubeUrl = activeVideoPlan && activeVideoLesson ? getLessonScopedValue(youtubeUrlByLesson, activeVideoPlan, activeVideoLesson, '') : ''
  const videoAnalysis = activeVideoPlan && activeVideoLesson ? getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, activeVideoPlan, activeVideoLesson, null) : null
  const videoRecommendation = activeVideoPlan && activeVideoLesson ? getLessonScopedValue<VideoRecommendation | null>(videoRecommendationByLesson, activeVideoPlan, activeVideoLesson, null) : null
  const activeVideoMatches = activeVideoLesson && videoAnalysis && activeVideoPlan ? selectDistinctVideoMatches(activeVideoPlan.lessons, videoAnalysis, activeVideoLesson.id) : []
  const activeQuizVideoMatches = activeVideoLesson && videoAnalysis ? buildQuizVideoMatches(videoAnalysis, activeVideoLesson.id, activeVideoMatches) : []
  const activeVideoStartSeconds = activeVideoStateKey ? videoPlayerStartByLesson[activeVideoStateKey] || 0 : 0
  const activeYoutubeEmbedUrl = videoAnalysis ? youtubeEmbedUrl(videoAnalysis.video.url, activeVideoStartSeconds) : ''
  const activeQuizKey = activeVideoStateKey
  const activeQuiz = activeQuizKey ? quizByLesson[activeQuizKey] || null : null
  const activeQuizAnswers = activeQuizKey ? quizAnswersByLesson[activeQuizKey] || {} : {}
  const activeQuizResult = useMemo(() => (activeQuiz ? buildQuizResult(activeQuiz, activeQuizAnswers) : null), [activeQuiz, activeQuizAnswers])
  const isActiveQuizStarted = Boolean(activeQuizKey && activeQuizSessionLessonId === activeQuizKey)
  const isActiveQuizSubmitted = activeQuizKey ? Boolean(quizSubmittedByLesson[activeQuizKey]) : false
  const canCompleteActiveQuiz = Boolean(activeQuiz && activeQuizResult && activeQuizResult.answeredCount === activeQuizResult.totalQuestions)
  const scheduleLessons = schedulePlans.flatMap((item) =>
    item.lessons.map((lesson) => ({
      plan: item,
      lesson
    }))
  )
  const scheduleWeeks = Array.from(new Set(scheduleLessons.map((item) => item.lesson.week))).sort((a, b) => a - b)
  const activeSchedulePlan = schedulePlans.find((item) => planStorageId(item) === activeSchedulePlanId) || null
  const filteredScheduleEvents = scheduleEvents.filter((event) => {
    const isCourseVisible = !event.planId || scheduleCourseFilters[event.planId] !== false
    const isKindVisible = scheduleKindFilters[event.kind] !== false
    return isCourseVisible && isKindVisible
  })
  const calendarMonth = buildMonthCalendar(calendarMonthDate, filteredScheduleEvents)
  const selectedDayEvents = filteredScheduleEvents
    .filter((event) => sameDate(scheduleEventDate(event), selectedScheduleDate))
    .sort((left, right) => left.start.localeCompare(right.start))
  const selectedWeekDates = buildScheduleWeekDates(activeScheduleWeek)
  const isQuizInProgress = Boolean(activeQuizSessionLessonId)
  const selectedChatSessions = selectedChatLesson ? chatSessionsByLesson[selectedChatLesson.id] || [] : []
  const selectedChatSessionId = selectedChatLesson ? activeChatSessionIdByLesson[selectedChatLesson.id] || selectedChatSessions[0]?.id || '' : ''
  const selectedChatSession = selectedChatSessions.find((session) => session.id === selectedChatSessionId) || selectedChatSessions[0] || null
  const messages = selectedChatSession?.messages || []
  const chatMessageCount = messages.filter((message) => !isLessonSupportMessage(message)).length
  const canPassActiveQuiz = Boolean(activeQuizResult && activeQuizResult.scorePercent > 70)
  const savedTopicOptions = chatTopics
    .filter((topic) => {
      const query = profile.topic.trim()
      if (!isTopicInputFocused || query.length < 2) return false
      return shouldSuggestTopic(topic.topic, query)
    })
    .slice(0, 4)

  const progress = useMemo(() => {
    if (!plan) return 0
    const done = plan.lessons.filter((lesson) => lesson.status === 'done').length
    return Math.round((done / plan.lessons.length) * 100)
  }, [plan])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) {
        setHasLoadedStorage(true)
        return
      }

      const parsed = JSON.parse(saved) as Partial<PersistedAppState>
      const restoredPlan = parsed.plan ? normalizeLoadedPlan(parsed.plan) : null
      const restoredSavedPlans = Array.isArray(parsed.savedPlans) ? parsed.savedPlans.filter(isLearningPlanLike).map(normalizeLoadedPlan) : []
      const restoredSchedulePlans = restoredPlan ? upsertSavedPlan(restoredSavedPlans, restoredPlan) : restoredSavedPlans
      const restoredRawChatTopics = Array.isArray(parsed.chatTopics) ? parsed.chatTopics : restoredPlan ? [buildChatTopic(restoredPlan)] : []
      const restoredChatData = pruneChatDataForPlans(restoredSchedulePlans, restoredRawChatTopics, parsed.chatHistoryByLesson || {})
      const restoredChatSessions = normalizeChatSessionsByLesson(restoredChatData.history, parsed.chatSessionsByLesson || {})
      setProfile(blankProfile)
      setPlan(restoredPlan)
      setSavedPlans(restoredSavedPlans)
      setSelectedLessonId(parsed.selectedLessonId || restoredPlan?.lessons[0]?.id || null)
      setActiveVideoPlanId(parsed.activeVideoPlanId || (restoredPlan ? planStorageId(restoredPlan) : restoredSavedPlans[0] ? planStorageId(restoredSavedPlans[0]) : null))
      setActiveVideoLessonId(parsed.activeVideoLessonId || restoredPlan?.lessons[0]?.id || null)
      setYoutubeUrlByLesson(parsed.youtubeUrlByLesson || legacyLessonMap(restoredPlan, parsed.youtubeUrl || ''))
      setVideoAnalysisByLesson(parsed.videoAnalysisByLesson || legacyLessonMap(restoredPlan, parsed.videoAnalysis || null))
      setVideoRecommendationByLesson(parsed.videoRecommendationByLesson || legacyLessonMap(restoredPlan, parsed.videoRecommendation || null))
      setQuizByLesson(parsed.quizStorageVersion === quizStorageVersion ? parsed.quizByLesson || {} : {})
      setQuizAnswersByLesson(parsed.quizStorageVersion === quizStorageVersion ? parsed.quizAnswersByLesson || {} : {})
      setQuizSubmittedByLesson(parsed.quizStorageVersion === quizStorageVersion ? parsed.quizSubmittedByLesson || {} : {})
      setScheduleEvents(buildParallelSchedule(restoredSchedulePlans))
      setActiveScheduleWeek(parsed.activeScheduleWeek || restoredPlan?.lessons[0]?.week || 1)
      setActiveSchedulePlanId(parsed.activeSchedulePlanId || (restoredPlan ? planStorageId(restoredPlan) : restoredSavedPlans[0] ? planStorageId(restoredSavedPlans[0]) : null))
      setChatTopics(restoredChatData.topics)
      setChatHistoryByLesson(restoredChatData.history)
      setChatSessionsByLesson(restoredChatSessions)
      setActiveChatSessionIdByLesson(pruneActiveChatSessionIds(parsed.activeChatSessionIdByLesson || {}, restoredChatSessions))
    } catch {
      // Ignore corrupted localStorage and start with a clean session.
    } finally {
      setHasLoadedStorage(true)
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, isAsking, activeChatLessonId])

  useEffect(() => {
    if (!hasLoadedStorage) return
    const validPlans = plan ? upsertSavedPlan(savedPlans, plan) : savedPlans
    const cleaned = pruneChatDataForPlans(validPlans, chatTopics, chatHistoryByLesson)
    if (!sameTopicIds(cleaned.topics, chatTopics)) {
      setChatTopics(cleaned.topics)
    }
    if (!sameRecordKeys(cleaned.history, chatHistoryByLesson)) {
      setChatHistoryByLesson(cleaned.history)
    }
    if (activeChatTopicId && !cleaned.topics.some((topic) => topic.id === activeChatTopicId)) {
      setActiveChatTopicId(null)
      setActiveChatLessonId(null)
    }
  }, [hasLoadedStorage, plan, savedPlans, chatTopics, chatHistoryByLesson, activeChatTopicId])

  useEffect(() => {
    if (!hasLoadedStorage) return

    const payload: PersistedAppState = {
      profile,
      plan,
      savedPlans,
      selectedLessonId,
      activeVideoPlanId,
      activeVideoLessonId,
      youtubeUrlByLesson,
      videoAnalysisByLesson,
      videoRecommendationByLesson,
      quizByLesson,
      quizAnswersByLesson,
      quizSubmittedByLesson,
      quizStorageVersion,
      scheduleEvents,
      activeScheduleWeek,
      activeSchedulePlanId,
      chatTopics,
      chatHistoryByLesson,
      chatSessionsByLesson,
      activeChatSessionIdByLesson
    }

    localStorage.setItem(storageKey, JSON.stringify(payload))
  }, [
    profile,
    plan,
    savedPlans,
    selectedLessonId,
    activeVideoPlanId,
    activeVideoLessonId,
    youtubeUrlByLesson,
    videoAnalysisByLesson,
    videoRecommendationByLesson,
    quizByLesson,
    quizAnswersByLesson,
    quizSubmittedByLesson,
    scheduleEvents,
    activeScheduleWeek,
    activeSchedulePlanId,
    chatTopics,
    chatHistoryByLesson,
    chatSessionsByLesson,
    activeChatSessionIdByLesson,
    hasLoadedStorage
  ])

  useEffect(() => {
    if (!hasLoadedStorage || !plan || isProcessingVideoBatch) return
    const planKey = planStorageId(plan)
    const alreadyStarted = plan.lessons.every((lesson) => autoSuggestedVideoKeysRef.current.has(videoJobKey(plan, lesson)))
    const hasMissingVideo = plan.lessons.some((lesson) => !getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, plan, lesson, null))
    if (!hasMissingVideo || alreadyStarted) return
    autoSuggestedVideoKeysRef.current.add(`batch:${planKey}`)
    void suggestAndAnalyzeAllVideos(plan)
  }, [hasLoadedStorage, plan])

  useEffect(() => {
    if (!hasLoadedStorage || !plan) return
    const planId = planStorageId(plan)
    const hasSuggestedResources = plan.lessons.some((lesson) => (lesson.recommendedResources || []).length > 0)
    if (!hasSuggestedResources || enrichedResourcePlanIdsRef.current.has(planId)) return
    enrichedResourcePlanIdsRef.current.add(planId)
    void enrichPlanResourceLinks(plan)
  }, [hasLoadedStorage, plan])

  async function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanTopic = profile.topic.trim()
    const cleanGoal = profile.goal.trim()
    const durationWeeks = Math.max(1, Math.min(12, Number(profile.durationWeeks) || 1))
    const hoursPerWeek = Number(profile.hoursPerWeek)

    if (!cleanTopic) {
      setProfileError('Chủ đề không được để trống.')
      return
    }

    if (!Number.isFinite(hoursPerWeek) || hoursPerWeek < 1 || hoursPerWeek > 168) {
      setProfileError('Giờ/tuần phải nằm trong khoảng 1 đến 168 giờ.')
      return
    }

    const nextProfile: LearnerProfile = {
      ...profile,
      topic: cleanTopic,
      goal: cleanGoal,
      durationWeeks,
      hoursPerWeek
    }

    setProfileError('')
    const duplicatePlan = !editingPlanId ? findDuplicateSavedPlanByTopic(savedPlans, cleanTopic) : null
    if (duplicatePlan) {
      setDuplicatePlanPrompt({ profile: nextProfile, existingPlan: duplicatePlan })
      return
    }

    await createPlanFromProfile(nextProfile)
  }

  async function createPlanFromProfile(nextProfile: LearnerProfile, options: { replacePlan?: LearningPlan; keepDuplicate?: boolean } = {}) {
    setIsGenerating(true)

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextProfile)
      })
      const payload = (await response.json().catch(() => null)) as { error?: string; plan?: LearningPlan } | null

      if (!response.ok || !payload?.plan) {
        setProfileError(payload?.error || 'Không tạo được lộ trình. Hãy thử lại.')
        return
      }

      const generatedPlan = normalizeLoadedPlan(payload.plan)
      const nextPlan = options.keepDuplicate ? withUniquePlanStorageId(generatedPlan) : generatedPlan
      const firstLesson = nextPlan.lessons[0] || null
      const nextTopic = buildChatTopic(nextPlan)
      const previousPlan = options.replacePlan || (editingPlanId ? savedPlans.find((item) => planStorageId(item) === editingPlanId) || (plan && planStorageId(plan) === editingPlanId ? plan : null) : null)
      const previousPlanId = previousPlan ? planStorageId(previousPlan) : editingPlanId
      const nextSavedPlans = upsertSavedPlan(previousPlan ? savedPlans.filter((item) => planStorageId(item) !== previousPlanId) : savedPlans, nextPlan)
      const nextPlanId = planStorageId(nextPlan)

      if (previousPlan) {
        const deletedLessonIds = new Set(previousPlan.lessons.map((lesson) => lesson.id))
        const deletedTopicId = buildChatTopic(previousPlan).id
        clearVideoStateForPlan(previousPlan)
        setChatTopics((current) => current.filter((topic) => topic.id !== deletedTopicId))
        setChatHistoryByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
        setChatSessionsByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
        setActiveChatSessionIdByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
        setExpandedScheduleTopicIds((current) => omitRecordKey(current, previousPlanId || ''))
        setExpandedVideoTopicIds((current) => omitRecordKey(current, previousPlanId || ''))
        setExpandedChatTopicIds((current) => omitRecordKey(current, deletedTopicId))
      }

      setPlan(nextPlan)
      setSavedPlans(nextSavedPlans)
      setSelectedLessonId(firstLesson?.id || null)
      setActiveSchedulePlanId(nextPlanId)
      setActiveVideoPlanId(nextPlanId)
      setActiveVideoLessonId(firstLesson?.id || null)
      setVideoError('')
      setActiveScheduleWeek(firstLesson?.week || 1)
      setScheduleEvents(buildParallelSchedule(nextSavedPlans))
      setActiveChatTopicId(nextTopic.id)
      setActiveChatLessonId(firstLesson?.id || null)
      setChatTopics((current) => upsertChatTopic(current, nextTopic))
      setExpandedScheduleTopicIds((current) => ({ ...current, [nextPlanId]: true }))
      setExpandedVideoTopicIds((current) => ({ ...current, [nextPlanId]: true }))
      setExpandedChatTopicIds((current) => ({ ...current, [nextTopic.id]: true }))
      setEditingPlanId(null)
      setDuplicatePlanPrompt(null)
      setIsProfileEditorOpen(false)
      setProfile(blankProfile)
      setIsTopicInputFocused(false)
      if (firstLesson) ensureLessonChat(firstLesson)
      setView('plan')
      void suggestAndAnalyzeAllVideos(nextPlan)
    } catch {
      setProfileError('Không tạo được lộ trình. Hãy kiểm tra kết nối hoặc thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

  function keepDuplicatePlan() {
    if (!duplicatePlanPrompt) return
    void createPlanFromProfile(duplicatePlanPrompt.profile, { keepDuplicate: true })
  }

  function replaceDuplicatePlan() {
    if (!duplicatePlanPrompt) return
    void createPlanFromProfile(duplicatePlanPrompt.profile, { replacePlan: duplicatePlanPrompt.existingPlan })
  }

  function cancelDuplicatePlanPrompt() {
    setDuplicatePlanPrompt(null)
    setProfileError('')
  }

  async function enrichPlanResourceLinks(sourcePlan: LearningPlan) {
    try {
      const response = await fetch('/api/resources/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: sourcePlan })
      })
      const payload = (await response.json().catch(() => null)) as { lessons?: Lesson[] } | null
      if (!response.ok || !payload?.lessons?.length) return

      const nextPlan = normalizeLoadedPlan({ ...sourcePlan, lessons: payload.lessons })
      const nextPlanId = planStorageId(nextPlan)
      const nextTopic = buildChatTopic(nextPlan)

      setPlan((current) => (current && planStorageId(current) === nextPlanId ? nextPlan : current))
      setSavedPlans((current) => current.map((item) => (planStorageId(item) === nextPlanId ? nextPlan : item)))
      setChatTopics((current) => current.map((topic) => (topic.id === nextTopic.id ? nextTopic : topic)))
    } catch {
      // Keep the current plan if enrichment fails.
    }
  }

  function openProfileEditor() {
    if (plan) {
      setProfile({ ...plan.profile })
      setEditingPlanId(planStorageId(plan))
    }
    setProfileError('')
    setIsTopicInputFocused(false)
    setIsProfileEditorOpen(true)
  }

  function closeProfileEditor() {
    setIsProfileEditorOpen(false)
    setEditingPlanId(null)
    setProfile(blankProfile)
    setProfileError('')
    setIsTopicInputFocused(false)
  }

  function startNewPlanDraft() {
    setEditingPlanId(null)
    setProfile(blankProfile)
    setProfileError('')
    setIsTopicInputFocused(false)
    setIsProfileEditorOpen(true)
  }

  function selectLesson(lessonId: string) {
    const lesson = plan?.lessons.find((item) => item.id === lessonId)
    setSelectedLessonId(lessonId)
    setQuestion('')
    if (lesson) ensureLessonChat(lesson)
  }

  function updateLessonStatus(lessonId: string, status: LessonStatus) {
    setPlan((current) => {
      if (!current) return current
      return {
        ...current,
        lessons: current.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, status } : lesson))
      }
    })
    setSavedPlans((current) =>
      current.map((savedPlan) => ({
        ...savedPlan,
        lessons: savedPlan.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, status } : lesson))
      }))
    )
  }

  async function requestLessonCompletion(lesson: Lesson) {
    if (!plan || isQuizInProgress) return
    const scopedKey = videoStateKey(plan, lesson)
    setSelectedLessonId(lesson.id)
    setActiveVideoPlanId(planStorageId(plan))
    setActiveVideoLessonId(lesson.id)
    setView('quiz')

    if (!quizByLesson[scopedKey]) {
      const didCreateQuiz = await generateLessonQuiz(lesson)
      if (!didCreateQuiz) return
    }

    setQuizAnswersByLesson((current) => ({ ...current, [scopedKey]: {} }))
    setQuizSubmittedByLesson((current) => ({ ...current, [scopedKey]: false }))
    setActiveQuizSessionLessonId(scopedKey)
  }

  function ensureLessonChat(lesson: Lesson) {
    setChatSessionsByLesson((current) => {
      if (current[lesson.id]?.length) return current
      const session = createChatSession(lesson, 1)
      setActiveChatSessionIdByLesson((active) => ({ ...active, [lesson.id]: session.id }))
      return { ...current, [lesson.id]: [session] }
    })
  }

  function selectChatLesson(topic: ChatTopic, lesson: Lesson) {
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(lesson.id)
    ensureLessonChat(lesson)
    const firstSession = chatSessionsByLesson[lesson.id]?.[0]
    if (firstSession) {
      setActiveChatSessionIdByLesson((current) => ({ ...current, [lesson.id]: current[lesson.id] || firstSession.id }))
    }
    setQuestion('')
  }

  async function sendTutorQuestion(rawQuestion: string) {
    const trimmed = rawQuestion.trim()
    if (!trimmed || !selectedChatTopic || !selectedChatLesson || isQuizInProgress) return

    const lessonId = selectedChatLesson.id
    const currentSession = selectedChatSession || createChatSession(selectedChatLesson, selectedChatSessions.length + 1)
    const currentMessages = currentSession.messages
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const nextMessages = [...currentMessages, userMessage]
    upsertChatSessionMessages(lessonId, currentSession, nextMessages)
    setQuestion('')
    setIsAsking(true)

    try {
      const videoReferences = buildTutorVideoReferences(trimmed, selectedChatLesson, selectedChatTopic, videoAnalysisByLesson)
      const contextMessages = currentMessages.filter((message) => !isLessonSupportMessage(message)).slice(-8)
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, plan: plan || topicToPlan(selectedChatTopic), lesson: selectedChatLesson, history: contextMessages, videoReferences })
      })
      const payload = await response.json()
      upsertChatSessionMessages(lessonId, currentSession, [...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: payload.answer }])
    } finally {
      setIsAsking(false)
    }
  }

  function clearCurrentChat() {
    if (!selectedChatLesson || !selectedChatSession) return
    upsertChatSessionMessages(selectedChatLesson.id, selectedChatSession, [buildLessonSupportMessage(selectedChatLesson)])
  }

  function upsertChatSessionMessages(lessonId: string, session: ChatSession, messages: ChatMessage[]) {
    const updatedSession = {
      ...session,
      title: buildChatSessionTitle(session, messages),
      updatedAt: new Date().toISOString(),
      messages
    }
    setChatSessionsByLesson((current) => {
      const sessions = current[lessonId] || []
      const exists = sessions.some((item) => item.id === session.id)
      return {
        ...current,
        [lessonId]: exists ? sessions.map((item) => (item.id === session.id ? updatedSession : item)) : [updatedSession, ...sessions]
      }
    })
    setActiveChatSessionIdByLesson((current) => ({ ...current, [lessonId]: session.id }))
  }

  function startNewChatSession(lesson: Lesson) {
    const nextIndex = (chatSessionsByLesson[lesson.id] || []).length + 1
    const session = createChatSession(lesson, nextIndex)
    setChatSessionsByLesson((current) => ({ ...current, [lesson.id]: [session, ...(current[lesson.id] || [])] }))
    setActiveChatSessionIdByLesson((current) => ({ ...current, [lesson.id]: session.id }))
    setActiveChatLessonId(lesson.id)
    setQuestion('')
  }

  function selectChatSession(lesson: Lesson, sessionId: string) {
    setActiveChatLessonId(lesson.id)
    setActiveChatSessionIdByLesson((current) => ({ ...current, [lesson.id]: sessionId }))
    setQuestion('')
  }

  async function askTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendTutorQuestion(question)
  }

  async function analyzeVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await analyzeVideoUrl(youtubeUrl)
  }

  async function analyzeVideoUrl(url: string, sourcePlan = activeVideoPlan, sourceLesson = activeVideoLesson) {
    const lesson = sourceLesson || sourcePlan?.lessons.find((item) => item.id === activeVideoLessonId) || sourcePlan?.lessons[0] || null
    if (!url.trim() || !sourcePlan || !lesson) return
    const stateKey = videoStateKey(sourcePlan, lesson)

    setIsAnalyzingVideo(true)
    setVideoError('')

    const response = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim(), lessons: sourcePlan.lessons, language: sourcePlan.profile.videoLanguage })
    })
    const payload = await response.json()

    if (!response.ok) {
      setVideoAnalysisByLesson((current) => omitRecordKey(current, stateKey))
      setVideoError(formatVideoUiError(payload.error || 'Không phân tích được video.'))
    } else {
      setVideoAnalysisByLesson((current) => ({ ...current, [stateKey]: payload.analysis as VideoAnalysis }))
      setVideoError('')
    }

    setIsAnalyzingVideo(false)
  }

  async function suggestAndAnalyzeVideo(sourcePlan = activeVideoPlan, sourceLesson = activeVideoLesson, force = false) {
    if (!sourcePlan) return
    if (!sourceLesson) return

    const autoSuggestKey = videoJobKey(sourcePlan, sourceLesson)
    const stateKey = videoStateKey(sourcePlan, sourceLesson)
    if (!force && (getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, sourcePlan, sourceLesson, null) || autoSuggestedVideoKeysRef.current.has(autoSuggestKey))) return
    autoSuggestedVideoKeysRef.current.add(autoSuggestKey)

    setIsSuggestingVideo(true)
    setVideoError('')

    const response = await fetch('/api/videos/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: sourcePlan,
        lesson: sourceLesson,
        excludedUrls: Object.entries(youtubeUrlByLesson)
          .filter(([lessonId, url]) => lessonId !== sourceLesson.id && url.trim())
          .map(([, url]) => url)
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      setVideoRecommendationByLesson((current) => omitRecordKey(current, stateKey))
      setVideoError(formatVideoUiError(payload.error || 'Không gợi ý được video.'))
      setIsSuggestingVideo(false)
      return
    }

    const recommendation = payload.recommendation as VideoRecommendation
    setVideoRecommendationByLesson((current) => ({ ...current, [stateKey]: recommendation }))
    setYoutubeUrlByLesson((current) => ({ ...current, [stateKey]: recommendation.url }))
    setIsSuggestingVideo(false)
    await analyzeVideoUrl(recommendation.url, sourcePlan, sourceLesson)
  }

  function playVideoAt(lessonId: string, startSeconds: number) {
    const stateKey = activeVideoPlan && activeVideoLesson && activeVideoLesson.id === lessonId ? videoStateKey(activeVideoPlan, activeVideoLesson) : lessonId
    setVideoPlayerStartByLesson((current) => ({ ...current, [stateKey]: Math.max(0, Math.floor(startSeconds)) }))
  }

  async function suggestAndAnalyzeAllVideos(sourcePlan = activeVideoPlan) {
    if (!sourcePlan || isProcessingVideoBatch) return

    setIsProcessingVideoBatch(true)
    setVideoError('')

    const sharedHandled = await suggestAndAnalyzeSharedVideo(sourcePlan)
    if (sharedHandled) {
      setVideoBatchStatus('')
      setIsProcessingVideoBatch(false)
      return
    }

    for (const lesson of sourcePlan.lessons) {
      const key = videoJobKey(sourcePlan, lesson)
      if (getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, sourcePlan, lesson, null) || autoSuggestedVideoKeysRef.current.has(key)) continue
      setVideoBatchStatus(`Đang gợi ý video tuần ${lesson.week}/${sourcePlan.lessons.length}`)
      await suggestAndAnalyzeVideo(sourcePlan, lesson)
    }

    setVideoBatchStatus('')
    setIsProcessingVideoBatch(false)
  }

  async function suggestAndAnalyzeSharedVideo(sourcePlan: LearningPlan) {
    const sharedKey = `shared:${planStorageId(sourcePlan)}:${sourcePlan.profile.videoLanguage}`
    const allLessonsAlreadyHaveVideo = sourcePlan.lessons.every((lesson) => getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, sourcePlan, lesson, null))
    if (allLessonsAlreadyHaveVideo || autoSuggestedVideoKeysRef.current.has(sharedKey)) return false

    autoSuggestedVideoKeysRef.current.add(sharedKey)
    setVideoBatchStatus('Đang tìm video tổng hợp cho toàn bộ lộ trình')

    const suggestResponse = await fetch('/api/videos/suggest-shared', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: sourcePlan })
    })
    const suggestPayload = await suggestResponse.json()
    const recommendation = suggestResponse.ok ? (suggestPayload.recommendation as VideoRecommendation | null) : null
    if (!recommendation?.url) return false

    setVideoBatchStatus('Đang phân tích video tổng hợp')
    const analyzeResponse = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: recommendation.url, lessons: sourcePlan.lessons, language: sourcePlan.profile.videoLanguage })
    })
    const analyzePayload = await analyzeResponse.json()

    if (!analyzeResponse.ok) {
      setVideoError(formatVideoUiError(analyzePayload.error || 'Không phân tích được video tổng hợp.'))
      return false
    }

    const analysis = analyzePayload.analysis as VideoAnalysis
    const nextAnalysis: Record<string, VideoAnalysis> = {}
    const nextRecommendation: Record<string, VideoRecommendation> = {}
    const nextUrls: Record<string, string> = {}

    for (const lesson of sourcePlan.lessons) {
      const stateKey = videoStateKey(sourcePlan, lesson)
      nextAnalysis[stateKey] = analysis
      nextRecommendation[stateKey] = recommendation
      nextUrls[stateKey] = recommendation.url
      autoSuggestedVideoKeysRef.current.add(videoJobKey(sourcePlan, lesson))
    }

    setVideoAnalysisByLesson((current) => ({ ...current, ...nextAnalysis }))
    setVideoRecommendationByLesson((current) => ({ ...current, ...nextRecommendation }))
    setYoutubeUrlByLesson((current) => ({ ...current, ...nextUrls }))
    setVideoError('')
    return true
  }

  async function generateLessonQuiz(sourceLesson = activeVideoLesson) {
    const sourcePlan = activeVideoPlan || plan
    if (!sourcePlan || !sourceLesson) return false
    const quizKey = videoStateKey(sourcePlan, sourceLesson)

    setIsGeneratingQuiz(true)
    setVideoError('')

    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: sourcePlan,
        lesson: sourceLesson,
        matches: quizKey === activeVideoStateKey ? activeQuizVideoMatches : []
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      setVideoError(payload.error || 'Không tạo được quiz.')
      setIsGeneratingQuiz(false)
      return false
    } else {
      const quiz = payload.quiz as LessonQuiz
      setQuizByLesson((current) => ({ ...current, [quizKey]: quiz }))
      setQuizAnswersByLesson((current) => ({ ...current, [quizKey]: {} }))
      setQuizSubmittedByLesson((current) => ({ ...current, [quizKey]: false }))
      setActiveQuizSessionLessonId(null)
      setVideoError('')
    }

    setIsGeneratingQuiz(false)
    return true
  }

  function startActiveQuiz() {
    if (!activeVideoLesson || !activeQuiz || !activeQuizKey) return
    setQuizAnswersByLesson((current) => ({ ...current, [activeQuizKey]: {} }))
    setQuizSubmittedByLesson((current) => ({ ...current, [activeQuizKey]: false }))
    setActiveQuizSessionLessonId(activeQuizKey)
  }

  function completeActiveQuiz() {
    if (!activeVideoLesson || !activeQuiz || !activeQuizKey || !canCompleteActiveQuiz) return
    setQuizSubmittedByLesson((current) => ({ ...current, [activeQuizKey]: true }))
    setActiveQuizSessionLessonId(null)
    if (canPassActiveQuiz) {
      updateLessonStatus(activeVideoLesson.id, 'done')
    }
  }

  function chooseQuizAnswer(questionId: string, optionIndex: number) {
    if (!activeVideoLesson || !activeQuiz || !activeQuizKey || !isActiveQuizStarted || isActiveQuizSubmitted) return
    if (typeof activeQuizAnswers[questionId] === 'number') return
    const nextLessonAnswers = {
      ...activeQuizAnswers,
      [questionId]: optionIndex
    }

    setQuizAnswersByLesson((current) => ({
      ...current,
      [activeQuizKey]: nextLessonAnswers
    }))
  }

  function addLessonToSchedule(lesson: Lesson, sourcePlan?: LearningPlan) {
    const ownerPlan = sourcePlan || plan || schedulePlans[0]
    const start = preferredScheduleStart[ownerPlan?.profile.learningTimePreference || profile.learningTimePreference]
    if (ownerPlan) setActiveSchedulePlanId(planStorageId(ownerPlan))
    const targetWeek = Math.max(1, lesson.week)
    const targetDate = addDays(scheduleBaseMonday, (targetWeek - 1) * 7)
    setScheduleEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        planId: ownerPlan ? planStorageId(ownerPlan) : undefined,
        planTitle: ownerPlan?.profile.topic,
        lessonId: lesson.id,
        week: lesson.week,
        title: ownerPlan ? `${ownerPlan.profile.topic}: ${lesson.title}` : lesson.title,
        day: 'Thứ 2',
        start,
        end: addMinutesToTime(start, Math.min(120, lesson.durationMinutes)),
        kind: 'study',
        status: 'planned'
      }
    ])
    setActiveScheduleWeek(targetWeek)
    setSelectedScheduleDate(targetDate)
    setCalendarMonthDate(startOfMonth(targetDate))
  }

  function toggleScheduleTopic(topicId: string) {
    setExpandedScheduleTopicIds((current) => ({ ...current, [topicId]: !current[topicId] }))
    setActiveSchedulePlanId(topicId)
    const sourcePlan = schedulePlans.find((item) => planStorageId(item) === topicId)
    setActiveScheduleWeek(sourcePlan?.lessons[0]?.week || 1)
  }

  function selectScheduleWeek(sourcePlan: LearningPlan, week: number) {
    setActiveSchedulePlanId(planStorageId(sourcePlan))
    setActiveScheduleWeek(week)
    const date = addDays(scheduleBaseMonday, (Math.max(1, week) - 1) * 7)
    setSelectedScheduleDate(date)
    setCalendarMonthDate(startOfMonth(date))
  }

  function clearScheduleFocus() {
    setActiveSchedulePlanId(null)
  }

  function toggleScheduleCourseFilter(planId: string) {
    setScheduleCourseFilters((current) => ({ ...current, [planId]: current[planId] === false }))
  }

  function toggleScheduleKindFilter(kind: ScheduleEvent['kind']) {
    setScheduleKindFilters((current) => ({ ...current, [kind]: current[kind] === false }))
  }

  function addBlankScheduleEvent(date = selectedScheduleDate) {
    const sourcePlan = activeSchedulePlan || schedulePlans.find((item) => scheduleCourseFilters[planStorageId(item)] !== false) || schedulePlans[0]
    const start = preferredScheduleStart[sourcePlan?.profile.learningTimePreference || profile.learningTimePreference]
    const week = scheduleWeekFromDate(date)
    const day = scheduleDays[(date.getDay() + 6) % 7]
    const nextEvent: ScheduleEvent = {
      id: crypto.randomUUID(),
      planId: sourcePlan ? planStorageId(sourcePlan) : undefined,
      planTitle: sourcePlan?.profile.topic,
      lessonId: 'custom',
      week,
      title: 'Buổi học mới',
      day,
      start,
      end: addMinutesToTime(start, 60),
      kind: 'study',
      status: 'planned'
    }
    setScheduleEvents((current) => [...current, nextEvent])
    setSelectedScheduleDate(date)
    setActiveScheduleWeek(week)
    setCalendarMonthDate(startOfMonth(date))
    setEditingScheduleEvent(nextEvent)
  }

  function toggleVideoTopic(sourcePlan: LearningPlan) {
    const sourcePlanId = planStorageId(sourcePlan)
    setActiveVideoPlanId(sourcePlanId)
    setActiveVideoLessonId((current) => sourcePlan.lessons.some((lesson) => lesson.id === current) ? current : sourcePlan.lessons[0]?.id || null)
    setExpandedVideoTopicIds((current) => ({ ...current, [sourcePlanId]: !current[sourcePlanId] }))
  }

  function selectVideoLesson(sourcePlan: LearningPlan, lesson: Lesson) {
    setActiveVideoPlanId(planStorageId(sourcePlan))
    setActiveVideoLessonId(lesson.id)
  }

  function toggleQuizTopic(sourcePlan: LearningPlan) {
    const sourcePlanId = planStorageId(sourcePlan)
    if (isQuizInProgress && activeQuizSessionLessonId && !activeQuizSessionLessonId.startsWith(`${sourcePlanId}:`)) return
    setActiveVideoPlanId(sourcePlanId)
    setActiveVideoLessonId((current) => sourcePlan.lessons.some((lesson) => lesson.id === current) ? current : sourcePlan.lessons[0]?.id || null)
    setExpandedQuizTopicIds((current) => ({ ...current, [sourcePlanId]: !current[sourcePlanId] }))
  }

  function selectQuizLesson(sourcePlan: LearningPlan, lesson: Lesson) {
    const targetKey = videoStateKey(sourcePlan, lesson)
    if (isQuizInProgress && activeQuizSessionLessonId !== targetKey) return
    setActiveVideoPlanId(planStorageId(sourcePlan))
    setActiveVideoLessonId(lesson.id)
    setExpandedQuizTopicIds((current) => ({ ...current, [planStorageId(sourcePlan)]: true }))
  }

  function toggleChatTopic(topic: ChatTopic) {
    setActiveChatTopicId(topic.id)
    setExpandedChatTopicIds((current) => ({ ...current, [topic.id]: !current[topic.id] }))
  }

  function moveScheduleEvent(eventId: string, day: string, start: string) {
    setScheduleEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event
        if (event.week > activeScheduleWeek) return event
        const sourcePlan = schedulePlans.find((item) => planStorageId(item) === event.planId)
        const lesson = sourcePlan?.lessons.find((item) => item.id === event.lessonId)
        const duration = event.kind === 'study' ? Math.min(120, lesson?.durationMinutes || 60) : event.kind === 'practice' ? 60 : 30
        return { ...event, week: activeScheduleWeek, day, start, end: addMinutesToTime(start, duration) }
      })
    )
  }

  function removeScheduleEvent(eventId: string) {
    setScheduleEvents((current) => current.filter((event) => event.id !== eventId))
    if (editingScheduleEvent?.id === eventId) setEditingScheduleEvent(null)
  }

  function selectScheduleDate(date: Date) {
    setSelectedScheduleDate(date)
    setActiveScheduleWeek(scheduleWeekFromDate(date))
    setCalendarMonthDate(startOfMonth(date))
  }

  function shiftScheduleRange(offset: number) {
    if (calendarViewMode === 'month') {
      setCalendarMonthDate((current) => addMonths(current, offset))
      return
    }

    const nextDate = addDays(selectedScheduleDate, offset * (calendarViewMode === 'week' ? 7 : 1))
    setSelectedScheduleDate(nextDate)
    setActiveScheduleWeek(scheduleWeekFromDate(nextDate))
    setCalendarMonthDate(startOfMonth(nextDate))
  }

  function jumpToToday() {
    const today = new Date()
    setCalendarMonthDate(startOfMonth(today))
    setSelectedScheduleDate(today)
    setActiveScheduleWeek(scheduleWeekFromDate(today))
  }

  function updateScheduleEventDateTime(eventId: string, date: Date, start: string, end?: string) {
    const week = scheduleWeekFromDate(date)
    const day = scheduleDays[(date.getDay() + 6) % 7]
    setScheduleEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event
        const duration = timeToMinutes(event.end) - timeToMinutes(event.start)
        const nextEnd = end || addMinutesToTime(start, Math.max(30, duration))
        return { ...event, week, day, start, end: nextEnd }
      })
    )
    setActiveScheduleWeek(week)
    setSelectedScheduleDate(date)
  }

  function resizeScheduleEvent(eventId: string, edge: 'start' | 'end', value: string) {
    setScheduleEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event
        if (edge === 'start') {
          return timeToMinutes(value) < timeToMinutes(event.end) ? { ...event, start: value } : event
        }
        return timeToMinutes(value) > timeToMinutes(event.start) ? { ...event, end: value } : event
      })
    )
  }

  function handleScheduleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const edgeSize = 80
    if (monthDragSwitchRef.current) return
    if (event.clientX > window.innerWidth - edgeSize) {
      monthDragSwitchRef.current = setTimeout(() => {
        shiftScheduleRange(1)
        monthDragSwitchRef.current = null
      }, 550)
    } else if (event.clientX < edgeSize) {
      monthDragSwitchRef.current = setTimeout(() => {
        shiftScheduleRange(-1)
        monthDragSwitchRef.current = null
      }, 550)
    }
  }

  function clearScheduleDragSwitch() {
    if (!monthDragSwitchRef.current) return
    clearTimeout(monthDragSwitchRef.current)
    monthDragSwitchRef.current = null
  }

  function startScheduleEventDrag(event: DragEvent<HTMLElement>, scheduleEvent: ScheduleEvent) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('schedule-event-id', scheduleEvent.id)
    setScheduleDragPreview(event, `${scheduleEvent.start} ${shortScheduleTitle(scheduleEvent.title)}`)
  }

  function handleMonthDayDrop(event: DragEvent<HTMLElement>, date: Date) {
    event.preventDefault()
    clearScheduleDragSwitch()
    const eventId = event.dataTransfer.getData('schedule-event-id')
    const lessonId = event.dataTransfer.getData('lesson-id')
    const planId = event.dataTransfer.getData('plan-id')
    if (eventId) {
      const target = scheduleEvents.find((item) => item.id === eventId)
      if (target) updateScheduleEventDateTime(eventId, date, target.start, target.end)
      return
    }
    createScheduleEventFromLesson(lessonId, planId, date)
  }

  function handleTimelineDrop(event: DragEvent<HTMLDivElement>, date: Date, start: string) {
    event.preventDefault()
    clearScheduleDragSwitch()
    const resizeEdge = event.dataTransfer.getData('resize-edge') as 'start' | 'end' | ''
    const eventId = event.dataTransfer.getData('schedule-event-id')
    const lessonId = event.dataTransfer.getData('lesson-id')
    const planId = event.dataTransfer.getData('plan-id')
    if (eventId && resizeEdge) {
      resizeScheduleEvent(eventId, resizeEdge, start)
      return
    }
    if (eventId) {
      updateScheduleEventDateTime(eventId, date, start)
      return
    }
    createScheduleEventFromLesson(lessonId, planId, date, start)
  }

  function createScheduleEventFromLesson(lessonId: string, planId: string, date: Date, start?: string) {
    const sourcePlan = schedulePlans.find((item) => planStorageId(item) === planId) || schedulePlans.find((item) => planStorageId(item) === activeSchedulePlanId) || plan || schedulePlans[0]
    const lesson = sourcePlan?.lessons.find((item) => item.id === lessonId)
    if (!lesson || !sourcePlan) return
    const startTime = start || preferredScheduleStart[sourcePlan.profile.learningTimePreference]
    const week = scheduleWeekFromDate(date)
    const day = scheduleDays[(date.getDay() + 6) % 7]
    setScheduleEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        planId: planStorageId(sourcePlan),
        planTitle: sourcePlan.profile.topic,
        lessonId: lesson.id,
        week,
        title: `${sourcePlan.profile.topic}: ${lesson.title}`,
        day,
        start: startTime,
        end: addMinutesToTime(startTime, Math.min(120, lesson.durationMinutes)),
        kind: 'study',
        status: 'planned'
      }
    ])
    setActiveSchedulePlanId(planStorageId(sourcePlan))
    setActiveScheduleWeek(week)
    setSelectedScheduleDate(date)
  }

  function saveScheduleEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingScheduleEvent) return
    const formData = new FormData(event.currentTarget)
    const dateValue = String(formData.get('date') || '')
    const start = String(formData.get('start') || editingScheduleEvent.start)
    const end = String(formData.get('end') || editingScheduleEvent.end)
    const date = dateValue ? new Date(`${dateValue}T00:00:00`) : scheduleEventDate(editingScheduleEvent)
    const week = scheduleWeekFromDate(date)
    const day = scheduleDays[(date.getDay() + 6) % 7]
    setScheduleEvents((current) =>
      current.map((item) =>
        item.id === editingScheduleEvent.id
          ? {
              ...item,
              title: String(formData.get('title') || item.title),
              week,
              day,
              start,
              end,
              note: String(formData.get('note') || ''),
              status: String(formData.get('status') || 'planned') as ScheduleEvent['status']
            }
          : item
      )
    )
    setSelectedScheduleDate(date)
    setActiveScheduleWeek(week)
    setCalendarMonthDate(startOfMonth(date))
    setEditingScheduleEvent(null)
  }

  function handleDropSchedule(event: DragEvent<HTMLDivElement>, day: string, start: string) {
    event.preventDefault()
    const eventId = event.dataTransfer.getData('schedule-event-id')
    const lessonId = event.dataTransfer.getData('lesson-id')
    const planId = event.dataTransfer.getData('plan-id')

    if (eventId) {
      moveScheduleEvent(eventId, day, start)
      return
    }

    const sourcePlan = schedulePlans.find((item) => planStorageId(item) === planId) || plan || schedulePlans[0]
    const lesson = sourcePlan?.lessons.find((item) => item.id === lessonId)
    if (!lesson || !sourcePlan) return
    if (lesson.week > activeScheduleWeek) return
    setScheduleEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        planId: planStorageId(sourcePlan),
        planTitle: sourcePlan.profile.topic,
        lessonId: lesson.id,
        week: activeScheduleWeek,
        title: `${sourcePlan.profile.topic}: ${lesson.title}`,
        day,
        start,
        end: addMinutesToTime(start, Math.min(120, lesson.durationMinutes)),
        kind: 'study'
      }
    ])
  }

  function applySavedTopic(topic: ChatTopic) {
    setEditingPlanId(null)
    setProfile(topic.profile)
    setIsProfileEditorOpen(true)
    setIsTopicInputFocused(false)
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(topic.lessons[0]?.id || null)
  }

  function clearVideoStateForPlan(nextPlan: LearningPlan) {
    const lessonIds = new Set(nextPlan.lessons.map((lesson) => lesson.id))
    const prefix = `${planStorageId(nextPlan)}:`
    setYoutubeUrlByLesson((current) => filterRecordByPrefix(current, prefix, false))
    setVideoAnalysisByLesson((current) => filterRecordByPrefix(current, prefix, false))
    setVideoRecommendationByLesson((current) => filterRecordByPrefix(current, prefix, false))
    setQuizByLesson((current) => filterRecordByKeys(filterRecordByPrefix(current, prefix, false), lessonIds, false))
    setQuizAnswersByLesson((current) => filterRecordByKeys(filterRecordByPrefix(current, prefix, false), lessonIds, false))
    setQuizSubmittedByLesson((current) => filterRecordByKeys(filterRecordByPrefix(current, prefix, false), lessonIds, false))
    setActiveQuizSessionLessonId(null)
  }

  function deleteSavedPlan(savedPlan: LearningPlan) {
    const savedPlanId = planStorageId(savedPlan)
    const deletedLessonIds = new Set(savedPlan.lessons.map((lesson) => lesson.id))
    const deletedTopicId = buildChatTopic(savedPlan).id
    const nextSavedPlans = savedPlans.filter((item) => planStorageId(item) !== savedPlanId)
    setSavedPlans(nextSavedPlans)
    setScheduleEvents(buildParallelSchedule(nextSavedPlans))
    setChatTopics((current) => current.filter((topic) => topic.id !== deletedTopicId))
    setChatHistoryByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
    setChatSessionsByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
    setActiveChatSessionIdByLesson((current) => filterRecordByKeys(current, deletedLessonIds, false))
    setExpandedChatTopicIds((current) => omitRecordKey(current, deletedTopicId))
    setExpandedVideoTopicIds((current) => omitRecordKey(current, savedPlanId))
    clearVideoStateForPlan(savedPlan)
    if (activeChatTopicId === deletedTopicId) {
      setActiveChatTopicId(null)
      setActiveChatLessonId(null)
    }

    if (!plan || planStorageId(plan) !== savedPlanId) return
    setPlan(null)
    setSelectedLessonId(null)
    setActiveSchedulePlanId(nextSavedPlans[0] ? planStorageId(nextSavedPlans[0]) : null)
    setActiveVideoPlanId(nextSavedPlans[0] ? planStorageId(nextSavedPlans[0]) : null)
    setActiveVideoLessonId(nextSavedPlans[0]?.lessons[0]?.id || null)
    setScheduleEvents(buildParallelSchedule(nextSavedPlans))
    setActiveScheduleWeek(1)
  }

  function confirmDeleteSavedPlan() {
    if (!planDeleteCandidate) return
    deleteSavedPlan(planDeleteCandidate)
    setPlanDeleteCandidate(null)
  }

  function applySavedPlan(savedPlan: LearningPlan) {
    const restoredPlan = normalizeLoadedPlan(savedPlan)
    const firstLesson = restoredPlan.lessons[0] || null
    const topic = buildChatTopic(restoredPlan)
    const nextSavedPlans = upsertSavedPlan(savedPlans, restoredPlan)
    const restoredPlanId = planStorageId(restoredPlan)

    setProfile(blankProfile)
    setIsTopicInputFocused(false)
    setPlan(restoredPlan)
    setSavedPlans(nextSavedPlans)
    setSelectedLessonId(firstLesson?.id || null)
    setActiveSchedulePlanId(restoredPlanId)
    setActiveVideoPlanId(restoredPlanId)
    setActiveVideoLessonId(firstLesson?.id || null)
    setVideoError('')
    setActiveScheduleWeek(firstLesson?.week || 1)
    setScheduleEvents(buildParallelSchedule(nextSavedPlans))
    setChatTopics((current) => upsertChatTopic(current, topic))
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(firstLesson?.id || null)
    setExpandedScheduleTopicIds((current) => ({ ...current, [restoredPlanId]: true }))
    setExpandedVideoTopicIds((current) => ({ ...current, [restoredPlanId]: true }))
    setExpandedChatTopicIds((current) => ({ ...current, [topic.id]: true }))
    setEditingPlanId(null)
    setIsProfileEditorOpen(false)
    if (firstLesson) ensureLessonChat(firstLesson)
    void suggestAndAnalyzeAllVideos(restoredPlan)
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">LearnMate Demo</p>
          <h1>Lộ trình học cá nhân hóa</h1>
        </div>
        <div className="top-actions">
          <div className="view-switch">
            <button className={view === 'plan' ? 'active' : ''} type="button" disabled={isQuizInProgress} onClick={() => setView('plan')}>
              Lộ trình
            </button>
            <button className={view === 'schedule' ? 'active' : ''} type="button" disabled={isQuizInProgress} onClick={() => setView('schedule')}>
              Lịch học
            </button>
            <button className={view === 'videos' ? 'active' : ''} type="button" disabled={isQuizInProgress} onClick={() => setView('videos')}>
              Video
            </button>
            <button className={view === 'quiz' ? 'active' : ''} type="button" onClick={() => setView('quiz')}>
              Quiz
            </button>
            <button className={view === 'chat' ? 'active' : ''} type="button" disabled={isQuizInProgress} onClick={() => setView('chat')}>
              Hỏi đáp
            </button>
          </div>
        </div>
      </section>

      {view === 'plan' ? (
        <section className="workspace">
          <form className="panel profile-panel" onSubmit={generatePlan}>
            <div className="panel-heading">
              <Sparkles size={18} />
              <h2>Hồ sơ học viên</h2>
            </div>

            {plan && !isProfileEditorOpen ? (
              <>
                <div className="profile-summary-card">
                  <div>
                    <p className="eyebrow">Tóm tắt nhanh</p>
                    <strong>{plan.profile.topic}</strong>
                    <p>{plan.summary}</p>
                  </div>
                  <div className="profile-summary-grid">
                    <div>
                      <span>Trình độ</span>
                      <strong>{learnerLevelLabel(plan.profile.level)}</strong>
                    </div>
                    <div>
                      <span>Số tuần</span>
                      <strong>{plan.profile.durationWeeks} tuần</strong>
                    </div>
                    <div>
                      <span>Giờ/tuần</span>
                      <strong>{plan.profile.hoursPerWeek} giờ</strong>
                    </div>
                    <div>
                      <span>Phong cách</span>
                      <strong>{learningStyleLabel(plan.profile.learningStyle)}</strong>
                    </div>
                  </div>
                </div>

                <div className="profile-panel-actions compact">
                  <button className="primary-button" type="button" onClick={startNewPlanDraft}>
                    <CalendarDays size={16} />
                    Tạo lộ trình mới
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="profile-form-grid">
                  <label>
                    Chủ đề
                    <div className="topic-combobox">
                      <input
                        required
                        value={profile.topic}
                        onBlur={() => setIsTopicInputFocused(false)}
                        onChange={(event) => setProfile({ ...profile, topic: event.target.value })}
                        onFocus={() => setIsTopicInputFocused(true)}
                      />
                      {savedTopicOptions.length > 0 && (
                        <div className="topic-suggestions">
                          {savedTopicOptions.map((topic) => (
                            <button key={topic.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applySavedTopic(topic)}>
                              <strong>{topic.topic}</strong>
                              <span>{topic.goal}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>

                  <label>
                    Mục tiêu
                    <textarea value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value })} rows={3} />
                  </label>

                  <div className="two-cols">
                    <label>
                      Trình độ
                      <select value={profile.level} onChange={(event) => setProfile({ ...profile, level: event.target.value })}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </label>
                    <label>
                      Tốc độ
                      <select value={profile.pace} onChange={(event) => setProfile({ ...profile, pace: event.target.value as LearnerProfile['pace'] })}>
                        <option value="gentle">Nhẹ</option>
                        <option value="normal">Vừa</option>
                        <option value="intensive">Cấp tốc</option>
                      </select>
                    </label>
                  </div>

                  <div className="two-cols">
                    <label>
                      Số tuần
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={profile.durationWeeks}
                        onChange={(event) => setProfile({ ...profile, durationWeeks: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Giờ/tuần
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={profile.hoursPerWeek}
                        onChange={(event) => setProfile({ ...profile, hoursPerWeek: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  <label>
                    Phong cách học
                    <select value={profile.learningStyle} onChange={(event) => setProfile({ ...profile, learningStyle: event.target.value as LearnerProfile['learningStyle'] })}>
                      <option value="mixed">Kết hợp</option>
                      <option value="concepts">Khái niệm</option>
                      <option value="practice">Thực hành</option>
                      <option value="project">Project</option>
                    </select>
                  </label>

                  <label>
                    Thời gian học ưu tiên
                    <select
                      value={profile.learningTimePreference}
                      onChange={(event) => setProfile({ ...profile, learningTimePreference: event.target.value as LearnerProfile['learningTimePreference'] })}
                    >
                      <option value="morning">Sáng</option>
                      <option value="noon">Trưa</option>
                      <option value="afternoon">Chiều</option>
                      <option value="evening">Tối</option>
                    </select>
                  </label>

                  <label>
                    Ngôn ngữ video
                    <select value={profile.videoLanguage} onChange={(event) => setProfile({ ...profile, videoLanguage: event.target.value as LearnerProfile['videoLanguage'] })}>
                      <option value="vi">Tiếng Việt</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </div>

                <div className="profile-panel-actions">
                  {plan && (
                    <button className="secondary-button" type="button" onClick={closeProfileEditor}>
                      Thu gọn hồ sơ
                    </button>
                  )}
                  <button className="primary-button" type="submit" disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="spin" size={18} /> : <CalendarDays size={18} />}
                    {editingPlanId ? 'Lưu chỉnh sửa' : plan ? 'Cập nhật lộ trình' : 'Tạo lộ trình học'}
                  </button>
                </div>

                {profileError && <div className="form-error">{profileError}</div>}
              </>
            )}

            {savedPlans.length > 0 && (
              <div className="saved-plan-list">
                <strong>Lộ trình đã lưu</strong>
                {savedPlans.map((savedPlan) => (
                  <div className="saved-plan-row" key={planStorageId(savedPlan)}>
                    <button className="saved-plan-open" type="button" onClick={() => applySavedPlan(savedPlan)}>
                      <span>{savedPlan.profile.topic}</span>
                      <small>{savedPlan.profile.durationWeeks} tuần · {savedPlan.profile.videoLanguage === 'en' ? 'English' : 'Tiếng Việt'}</small>
                    </button>
                    <button className="saved-plan-delete" type="button" onClick={() => setPlanDeleteCandidate(savedPlan)} aria-label="Xóa lộ trình">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>

          <section className="plan-column">
            <div className="panel plan-summary">
              <div className="plan-summary-main">
                <div className="panel-heading">
                  <BookOpen size={18} />
                  <h2>{plan?.title || 'Lộ trình học'}</h2>
                </div>
                <p>{plan?.summary || 'Nhập hồ sơ học viên rồi tạo kế hoạch cá nhân hóa.'}</p>
                {plan && (
                  <>
                    <div className="plan-summary-meta">
                      <span>{plan.profile.durationWeeks} tuần học</span>
                      <span>{plan.profile.hoursPerWeek} giờ mỗi tuần</span>
                      <span>{pacingLabel(plan.lessons[0]?.pacing)}</span>
                    </div>
                    <div className="foundation-box compact">
                      <div>
                        <strong>Kiến thức nền tảng</strong>
                        <span>Gợi ý {plan.recommendedWeeks} tuần</span>
                      </div>
                      <ul>
                        {plan.prerequisites.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
              <div className="progress-box">
                <div className="progress-head">
                  <strong>Tiến độ</strong>
                  <span>{progress}%</span>
                </div>
                <div className="progress-track">
                  <div style={{ width: `${progress}%` }} />
                </div>
                {plan && <small>{plan.durationAdvice}</small>}
              </div>
            </div>

            <div className="lessons">
              {plan ? (
                plan.lessons.map((lesson) => (
                  <article
                    key={lesson.id}
                    className={`lesson-card ${selectedLesson?.id === lesson.id ? 'active' : ''}`}
                  >
                    <div className="lesson-card-body">
                      <div className="lesson-head">
                        <span>Tuần {lesson.week}</span>
                        <small>{statusLabel[lesson.status]}</small>
                      </div>
                      <div className={`pacing-badge ${lesson.pacing || 'normal'}`}>{pacingLabel(lesson.pacing)}</div>
                      <strong>{lesson.title}</strong>
                      <p>{lesson.objective}</p>
                      <div className="lesson-meta">
                        <Clock size={15} />
                        {lesson.durationMinutes} phút
                      </div>
                    </div>
                    <button className="lesson-card-action" onClick={() => selectLesson(lesson.id)} type="button">
                      {lessonActionLabel(lesson, selectedLesson?.id === lesson.id)}
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state">Kế hoạch sẽ xuất hiện ở đây sau khi tạo.</div>
              )}
            </div>
          </section>

          <aside className="panel tutor-panel">
            <div className="panel-heading">
              <MessageSquareText size={18} />
              <h2>Gợi ý học tập</h2>
            </div>

            {selectedLesson ? (
              <div className="lesson-detail">
                <div className="detail-hero">
                  <div>
                    <p className="eyebrow">Bài đang chọn</p>
                    <strong>{selectedLesson.title}</strong>
                    <span>Tuần {selectedLesson.week} · {selectedLesson.durationMinutes} phút</span>
                  </div>
                  <div className="detail-hero-actions">
                    <select
                      value={selectedLesson.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value as LessonStatus
                        if (nextStatus === 'done') {
                          void requestLessonCompletion(selectedLesson)
                          return
                        }
                        updateLessonStatus(selectedLesson.id, nextStatus)
                      }}
                    >
                      <option value="todo">Chưa học</option>
                      <option value="doing">Đang học</option>
                      {selectedLesson.status === 'done' && <option value="done">Hoàn thành</option>}
                      <option value="review">Cần ôn</option>
                    </select>
                    <button className="complete-button inline" type="button" disabled={isQuizInProgress} onClick={() => void requestLessonCompletion(selectedLesson)}>
                      <CheckCircle2 size={16} />
                      Đánh dấu hoàn thành
                    </button>
                  </div>
                </div>

                <div className="detail-section">
                  <span>Nội dung chính</span>
                  <ul>
                    <li>{selectedLesson.objective}</li>
                    <li>{selectedLesson.checkpoint}</li>
                  </ul>
                </div>

                <div className="detail-section">
                  <span>Hoạt động học tập</span>
                  <ul>
                    {selectedLesson.activities.map((activity) => (
                      <li key={activity}>{activity}</li>
                    ))}
                  </ul>
                </div>

                <div className="learning-assets compact single">
                  <AssetList icon={<Link size={15} />} title="Tài liệu gợi ý" items={selectedLesson.recommendedResources?.length ? selectedLesson.recommendedResources : selectedLesson.resources} />
                </div>
              </div>
            ) : (
              <div className="empty-state compact">Chọn hoặc tạo một bài học để xem gợi ý.</div>
            )}
          </aside>
        </section>
      ) : view === 'schedule' ? (
        <section className="schedule-workspace">
          <aside className="schedule-filter-sidebar">
            <div className="schedule-filter-head">
              <CalendarDays size={17} />
              <strong>Lịch học</strong>
            </div>
            <div className="schedule-filter-section">
              <span>Khóa học</span>
              {schedulePlans.length > 0 ? (
                schedulePlans.map((sourcePlan) => {
                  const sourcePlanId = planStorageId(sourcePlan)
                  return (
                    <label className="schedule-filter-option" key={sourcePlanId}>
                      <input checked={scheduleCourseFilters[sourcePlanId] !== false} type="checkbox" onChange={() => toggleScheduleCourseFilter(sourcePlanId)} />
                      <span>{sourcePlan.profile.topic}</span>
                    </label>
                  )
                })
              ) : (
                <p>Tạo lộ trình trước để có lịch học.</p>
              )}
            </div>
            <div className="schedule-filter-section">
              <span>Loại hoạt động</span>
              {scheduleKindOptions.map((kind) => (
                <label className="schedule-filter-option" key={kind.id}>
                  <input checked={scheduleKindFilters[kind.id] !== false} type="checkbox" onChange={() => toggleScheduleKindFilter(kind.id)} />
                  <i className={`kind-dot ${kind.id}`} />
                  <span>{kind.label}</span>
                </label>
              ))}
            </div>
            <button className="schedule-filter-action" type="button" disabled={schedulePlans.length === 0} onClick={() => setScheduleEvents(buildParallelSchedule(schedulePlans))}>
              Tự xếp lại
            </button>
          </aside>
          <aside className="legacy-schedule-sidebar">
            <div className="panel-heading">
              <CalendarDays size={18} />
              <h2>Bài học có thể xếp lịch</h2>
            </div>
            {scheduleWeeks.length > 0 && (
              <div className="week-picker compact">
                {scheduleWeeks.map((week) => (
                  <button className={activeScheduleWeek === week ? 'active' : ''} key={week} type="button" onClick={() => setActiveScheduleWeek(week)}>
                    Tuần {week}
                  </button>
                ))}
              </div>
            )}
            {schedulePlans.length > 0 ? (
              schedulePlans.map((sourcePlan) => {
                const sourcePlanId = planStorageId(sourcePlan)
                const isExpanded = Boolean(expandedScheduleTopicIds[sourcePlanId])
                return (
                  <div className="schedule-topic-group" key={sourcePlanId}>
                    <button className={`schedule-topic-button ${activeSchedulePlanId === sourcePlanId ? 'active' : ''}`} type="button" onClick={() => toggleScheduleTopic(sourcePlanId)}>
                      <strong>{sourcePlan.profile.topic}</strong>
                      <span>{sourcePlan.lessons.length} bài học · {sourcePlan.profile.hoursPerWeek} giờ/tuần</span>
                    </button>
                    {isExpanded && (
                      <div className="schedule-lesson-list">
                        {sourcePlan.lessons.map((lesson) => (
                          <div
                            className={`draggable-lesson ${activeSchedulePlanId === sourcePlanId && activeScheduleWeek === lesson.week ? 'active' : ''} ${activeSchedulePlanId && activeSchedulePlanId !== sourcePlanId ? 'muted' : ''}`}
                            draggable
                            key={`${sourcePlanId}-${lesson.id}`}
                            onClick={() => selectScheduleWeek(sourcePlan, lesson.week)}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('lesson-id', lesson.id)
                              event.dataTransfer.setData('plan-id', sourcePlanId)
                            }}
                          >
                            <GripVertical size={16} />
                            <div>
                              <strong>Tuần {lesson.week}: {lesson.title}</strong>
                              <span>{lesson.durationMinutes} phút · {pacingLabel(lesson.pacing)}</span>
                            </div>
                            <button type="button" onClick={() => addLessonToSchedule(lesson, sourcePlan)}>
                              <CalendarDays size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="empty-state compact">Tạo lộ trình trước để tự sinh lịch học.</div>
            )}
          </aside>

          <section className="panel schedule-board">
            <div className="gcal-header">
              <div className="gcal-controls">
                <button type="button" onClick={jumpToToday}>Hôm nay</button>
                <button type="button" aria-label={scheduleNavigationLabel(calendarViewMode, -1)} onClick={() => shiftScheduleRange(-1)}>‹</button>
                <button type="button" aria-label={scheduleNavigationLabel(calendarViewMode, 1)} onClick={() => shiftScheduleRange(1)}>›</button>
              </div>
              <div className="gcal-title">
                <p className="eyebrow">Lịch học</p>
                <h2>{formatScheduleHeaderTitle(calendarViewMode, calendarMonthDate, selectedScheduleDate)}</h2>
              </div>
              <div className="gcal-controls">
                <button type="button" onClick={jumpToToday}>Hôm nay</button>
                <button type="button" aria-label={scheduleNavigationLabel(calendarViewMode, -1)} onClick={() => shiftScheduleRange(-1)}>‹</button>
                <button type="button" aria-label={scheduleNavigationLabel(calendarViewMode, 1)} onClick={() => shiftScheduleRange(1)}>›</button>
                {activeSchedulePlan && <button type="button" onClick={clearScheduleFocus}>Tất cả</button>}
                <button type="button" disabled={schedulePlans.length === 0} onClick={() => setScheduleEvents(buildParallelSchedule(schedulePlans))}>
                  Tự xếp lại
                </button>
              </div>
              <div className="gcal-view-switch" aria-label="Chế độ xem lịch">
                {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
                  <button className={calendarViewMode === mode ? 'active' : ''} key={mode} type="button" onClick={() => setCalendarViewMode(mode)}>
                    {mode === 'month' ? 'Tháng' : mode === 'week' ? 'Tuần' : 'Ngày'}
                  </button>
                ))}
              </div>
            </div>

            <div className={`gcal-layout ${calendarViewMode === 'day' ? 'day-detail-mode' : ''}`}>
              <section className="gcal-month" onDragOver={handleScheduleDragOver} onDragLeave={clearScheduleDragSwitch} onDrop={clearScheduleDragSwitch}>
                <div className="gcal-weekdays">
                  {(calendarViewMode === 'week' ? selectedWeekDates.map((item) => item.day) : scheduleDays).map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className={calendarViewMode === 'week' ? 'gcal-month-grid week-mode' : 'gcal-month-grid'}>
                  {(calendarViewMode === 'week' ? selectedWeekDates.map((item) => ({ key: dateKey(item.date), date: item.date, isCurrentMonth: true, events: filteredScheduleEvents.filter((event) => sameDate(scheduleEventDate(event), item.date)) })) : calendarMonth.days).map((day) => {
                    const isSelected = sameDate(day.date, selectedScheduleDate)
                    const isToday = sameDate(day.date, new Date())
                    return (
                      <button
                        className={`gcal-day ${day.isCurrentMonth ? '' : 'outside'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                        key={day.key}
                        type="button"
                        onClick={() => selectScheduleDate(day.date)}
                        onDragOver={handleScheduleDragOver}
                        onDrop={(event) => handleMonthDayDrop(event, day.date)}
                      >
                        <span className="gcal-day-number">{day.date.getDate()}</span>
                        <div className="gcal-day-events">
                          {day.events.slice(0, monthDayVisibleEventLimit).map((item) => {
                            const isPlanActive = !activeSchedulePlanId || item.planId === activeSchedulePlanId
                            return (
                              <div
                                className={`gcal-event-pill ${item.kind} ${isPlanActive ? '' : 'dimmed'}`}
                                draggable
                                key={item.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setEditingScheduleEvent(item)
                                  selectScheduleDate(day.date)
                                }}
                                onDragStart={(event) => startScheduleEventDrag(event, item)}
                              >
                                <b>{item.start}</b>
                                <span>{shortScheduleTitle(item.title)}</span>
                              </div>
                            )
                          })}
                          {day.events.length > monthDayVisibleEventLimit && <em>+{day.events.length - monthDayVisibleEventLimit} buổi khác</em>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              <aside className="gcal-day-panel">
                <div className="gcal-day-panel-head">
                  <div>
                    <p className="eyebrow">Ngày được chọn</p>
                    <h3>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(selectedScheduleDate)}</h3>
                  </div>
                  <span>{selectedDayEvents.length} buổi</span>
                </div>
                <div className="gcal-day-summary">
                  {selectedDayEvents.length > 0 ? (
                    selectedDayEvents.map((item) => (
                      <button
                        className={`gcal-summary-event ${item.kind}`}
                        draggable
                        key={item.id}
                        type="button"
                        onClick={() => setEditingScheduleEvent(item)}
                        onDragStart={(event) => startScheduleEventDrag(event, item)}
                      >
                        <strong>{item.start} - {item.end}</strong>
                        <span>{shortScheduleTitle(item.title)}</span>
                      </button>
                    ))
                  ) : (
                    <div className="gcal-empty-day">Chưa có buổi học nào trong ngày này.</div>
                  )}
                </div>
                <div className="gcal-day-panel-actions">
                  <button type="button" onClick={() => addBlankScheduleEvent(selectedScheduleDate)}>Thêm buổi học</button>
                  <button type="button" onClick={() => setCalendarViewMode('day')}>Xem chi tiết ngày</button>
                  <button className="gcal-back-month" type="button" onClick={() => setCalendarViewMode('month')}>Quay lại Month View</button>
                </div>
                <div className="gcal-timeline">
                  {(() => {
                    const timelineLayout = buildDayTimelineLayout(selectedDayEvents)
                    const minuteHeight = 1.1
                    const rowHeight = 66
                    const timelineStartMinutes = timeToMinutes(dayTimelineSlots[0] || '06:00')
                    const timelineEndMinutes = timeToMinutes(dayTimelineSlots[dayTimelineSlots.length - 1] || '23:00') + 60
                    const timelineHeight = Math.max(dayTimelineSlots.length * rowHeight, Math.ceil((timelineEndMinutes - timelineStartMinutes) * minuteHeight))

                    return (
                      <div className="gcal-time-grid" style={{ minHeight: `${timelineHeight}px` }}>
                        {dayTimelineSlots.map((slot) => (
                          <div className="gcal-time-row" key={slot} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleTimelineDrop(event, selectedScheduleDate, slot)}>
                            <span>{slot}</span>
                            <div className="gcal-time-cell" />
                          </div>
                        ))}
                        <div className="gcal-time-events-layer">
                          {timelineLayout.map(({ event: item, column, columnCount, top, height }) => {
                            const width = `calc(${100 / columnCount}% - 6px)`
                            const left = `calc(${(100 / columnCount) * column}% + 3px)`
                            return (
                              <div
                                className={`gcal-time-event ${item.kind}`}
                                draggable
                                key={item.id}
                                onClick={() => setEditingScheduleEvent(item)}
                                onDragStart={(event) => startScheduleEventDrag(event, item)}
                                style={{ top: `${top}px`, minHeight: `${height}px`, height: `${height}px`, left, width }}
                              >
                                <button
                                  className="resize-handle top"
                                  draggable
                                  type="button"
                                  aria-label="Kéo để đổi giờ bắt đầu"
                                  onDragStart={(event) => {
                                    event.stopPropagation()
                                    event.dataTransfer.setData('schedule-event-id', item.id)
                                    event.dataTransfer.setData('resize-edge', 'start')
                                  }}
                                />
                                <strong>{item.title}</strong>
                                <span>{item.start} - {item.end}</span>
                                <button
                                  className="resize-handle bottom"
                                  draggable
                                  type="button"
                                  aria-label="Kéo để đổi giờ kết thúc"
                                  onDragStart={(event) => {
                                    event.stopPropagation()
                                    event.dataTransfer.setData('schedule-event-id', item.id)
                                    event.dataTransfer.setData('resize-edge', 'end')
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </aside>
            </div>
          </section>
        </section>
      ) : view === 'videos' ? (
        <section className="video-workspace">
          <aside className="panel video-sidebar">
            <div className="panel-heading">
              <PlaySquare size={18} />
              <h2>Video theo lộ trình</h2>
            </div>
            {schedulePlans.length > 0 ? (
              schedulePlans.map((sourcePlan) => {
                const sourcePlanId = planStorageId(sourcePlan)
                const isExpanded = Boolean(expandedVideoTopicIds[sourcePlanId])
                const isActivePlan = activeVideoPlan && planStorageId(activeVideoPlan) === sourcePlanId
                return (
                  <div className="video-topic-group" key={sourcePlanId}>
                    <button className={`schedule-topic-button ${isActivePlan ? 'active' : ''}`} type="button" onClick={() => toggleVideoTopic(sourcePlan)}>
                      <strong>{sourcePlan.profile.topic}</strong>
                      <span>{sourcePlan.lessons.length} bài học · {sourcePlan.profile.hoursPerWeek} giờ/tuần</span>
                    </button>
                    {isExpanded && (
                      <div className="video-lesson-list">
                        {sourcePlan.lessons.map((lesson) => {
                          const hasVideo = Boolean(getLessonScopedValue<VideoAnalysis | null>(videoAnalysisByLesson, sourcePlan, lesson, null))
                          return (
                            <button
                              className={isActivePlan && activeVideoLesson?.id === lesson.id ? 'active' : ''}
                              key={`${sourcePlanId}-${lesson.id}`}
                              type="button"
                              onClick={() => selectVideoLesson(sourcePlan, lesson)}
                            >
                              <strong>Tuần {lesson.week}: {lesson.title}</strong>
                              <span>{hasVideo ? 'Đã lưu video gợi ý' : 'Chưa có video gợi ý'}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="empty-state compact">Tạo lộ trình trước, sau đó nhập YouTube URL để tìm đoạn phù hợp.</div>
            )}
          </aside>

          <section className="panel video-main">
            {activeVideoLesson ? (
              <>
                <div className="chat-main-header">
                  <div>
                    <p className="eyebrow">Video RAG</p>
                    <h2>{activeVideoLesson.title}</h2>
                    <p>{activeVideoLesson.objective}</p>
                  </div>
                </div>

                <div className="video-study-grid">
                  <div className="video-study-content">
                <form className="video-url-form" onSubmit={analyzeVideo}>
                  <input
                    value={youtubeUrl}
                    onChange={(event) => activeVideoStateKey && setYoutubeUrlByLesson((current) => ({ ...current, [activeVideoStateKey]: event.target.value }))}
                    placeholder="YouTube URL sẽ được LLM gợi ý, hoặc bạn có thể dán tay..."
                  />
                  <button className="primary-button" type="submit" disabled={!activeVideoPlan || !youtubeUrl.trim() || isAnalyzingVideo}>
                    {isAnalyzingVideo ? <Loader2 className="spin" size={18} /> : <PlaySquare size={18} />}
                    Phân tích
                  </button>
                </form>

                <button className="secondary-button video-suggest-button" type="button" disabled={!activeVideoPlan || isSuggestingVideo || isAnalyzingVideo} onClick={() => suggestAndAnalyzeVideo()}>
                  {isSuggestingVideo ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                  Gợi ý video bằng LLM và phân tích
                </button>

                {isProcessingVideoBatch && (
                  <div className="video-processing">
                    <Loader2 className="spin" size={16} />
                    {videoBatchStatus || 'Đang gợi ý video cho các tuần...'}
                  </div>
                )}

                {videoError && <div className="video-error">{videoError}</div>}

                {videoRecommendation && (
                  <div className="video-recommendation">
                    <div>
                      <strong>{videoRecommendation.scope === 'plan' ? 'Video tổng hợp cho toàn bộ lộ trình' : 'LLM đã chọn video'}</strong>
                      <span>{videoRecommendation.durationMinutes} phút</span>
                    </div>
                    <p>{videoRecommendation.title}</p>
                    <small>{videoRecommendation.reason}</small>
                    <a className="video-open-link" href={videoRecommendation.url} target="_blank" rel="noreferrer">
                      <Link size={15} />
                      Mở video trên YouTube
                    </a>
                  </div>
                )}

                {videoAnalysis ? (
                  <>
                    <div className="video-card analyzed">
                      <span>YOUTUBE</span>
                      <strong>{videoAnalysis.video.title}</strong>
                      <p>{videoAnalysis.video.segments.length} đoạn transcript đã được chunk, đặt tên và embedding.</p>
                      <small>{videoAnalysis.video.durationMinutes} phút</small>
                    </div>

                    {activeYoutubeEmbedUrl ? (
                      <div className="video-embed">
                        <iframe
                          key={activeYoutubeEmbedUrl}
                          src={activeYoutubeEmbedUrl}
                          title={videoAnalysis.video.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    ) : null}

                    <div className="timestamp-panel">
                      <div>
                        <strong>Đoạn phù hợp với bài đang học</strong>
                        <span>Phát trực tiếp trong trang</span>
                      </div>
                      {activeVideoMatches.length > 0 ? (
                        activeVideoMatches.map((match) => (
                          <button className="timestamp-link" key={match.id} type="button" onClick={() => activeVideoLesson && playVideoAt(activeVideoLesson.id, match.startSeconds)}>
                            <strong>{secondsToTimestamp(match.startSeconds)}-{secondsToTimestamp(match.endSeconds)}</strong>
                            <span>
                              <b>{match.title}</b>
                              {match.summary || 'Mở timestamp để xem nội dung chính của đoạn này.'}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p>Chưa tìm thấy đoạn đủ liên quan với bài này. Thử video khác hoặc đổi bài học ở sidebar.</p>
                      )}
                    </div>
                  </>
                ) : null}

                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">Chọn một bài học để xem video gợi ý.</div>
            )}
          </section>
        </section>
      ) : view === 'quiz' ? (
        <section className="quiz-workspace">
          <aside className="panel video-sidebar">
            <div className="panel-heading">
              <FileQuestion size={18} />
              <h2>Quiz theo lộ trình</h2>
            </div>
            {schedulePlans.length > 0 ? (
              schedulePlans.map((sourcePlan) => {
                const sourcePlanId = planStorageId(sourcePlan)
                const isExpanded = Boolean(expandedQuizTopicIds[sourcePlanId])
                const isActivePlan = activeVideoPlan && planStorageId(activeVideoPlan) === sourcePlanId
                return (
                  <div className="video-topic-group" key={sourcePlanId}>
                    <button className={`schedule-topic-button ${isActivePlan ? 'active' : ''}`} type="button" onClick={() => toggleQuizTopic(sourcePlan)}>
                      <strong>{sourcePlan.profile.topic}</strong>
                      <span>{sourcePlan.lessons.length} tuần · {sourcePlan.profile.hoursPerWeek} giờ/tuần</span>
                    </button>
                    {isExpanded && (
                      <div className="video-lesson-list">
                        {sourcePlan.lessons.map((lesson) => (
                          <button
                            className={isActivePlan && activeVideoLesson?.id === lesson.id ? 'active' : ''}
                            key={`${sourcePlanId}-${lesson.id}`}
                            type="button"
                            disabled={isQuizInProgress && videoStateKey(sourcePlan, lesson) !== activeQuizSessionLessonId}
                            onClick={() => selectQuizLesson(sourcePlan, lesson)}
                          >
                            <strong>Tuần {lesson.week}</strong>
                            <span>{lesson.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="empty-state compact">Tạo lộ trình và phân tích video trước khi làm quiz.</div>
            )}
          </aside>

          <section className="panel quiz-main">
            {activeVideoLesson ? (
              <>
                <div className="quiz-header">
                  <div>
                    <p className="eyebrow">Kiểm tra kiến thức đã học</p>
                    <strong>Bài kiểm tra năng lực tuần {activeVideoLesson.week}</strong>
                    <span>
                      {activeQuiz
                        ? `${activeQuiz.questions.length} bài tập cơ bản/nâng cao theo chủ đề tuần học.`
                        : videoAnalysis
                          ? 'Tạo bài kiểm tra theo bài học, có thể kèm timestamp từ video đã phân tích.'
                          : 'Tạo bài kiểm tra theo chủ đề và nội dung tuần học hiện tại.'}
                    </span>
                  </div>
                  <div className="quiz-actions">
                    <button className="secondary-button" type="button" disabled={!activeVideoPlan || isGeneratingQuiz || isQuizInProgress} onClick={() => void generateLessonQuiz()}>
                      {isGeneratingQuiz ? <Loader2 className="spin" size={18} /> : <FileQuestion size={18} />}
                      {activeQuiz ? 'Tạo lại bài kiểm tra' : 'Tạo bài kiểm tra'}
                    </button>
                    <button className="primary-button" type="button" disabled={!activeQuiz || isQuizInProgress} onClick={startActiveQuiz}>
                      <CheckCircle2 size={18} />
                      {isActiveQuizSubmitted ? 'Làm lại' : 'Bắt đầu'}
                    </button>
                    <button className="secondary-button" type="button" disabled={!isActiveQuizStarted || !canCompleteActiveQuiz} onClick={completeActiveQuiz}>
                      Hoàn thành
                    </button>
                  </div>
                </div>

                {isQuizInProgress && (
                  <div className="quiz-lock-note">
                    Đang làm quiz. Tất cả tab khác và phần hỏi đáp tạm khóa cho đến khi bạn bấm Hoàn thành.
                  </div>
                )}

                {activeQuiz && (isActiveQuizStarted || isActiveQuizSubmitted) ? (
                  <div className="quiz-list">
                    {activeQuizResult && isActiveQuizSubmitted && (
                      <div className="quiz-result-card">
                        <div>
                          <span>Điểm quiz</span>
                          <strong>{activeQuizResult.scorePercent}%</strong>
                          <small>
                            {activeQuizResult.correctCount}/{activeQuizResult.totalQuestions} câu đúng, đã trả lời {activeQuizResult.answeredCount}/{activeQuizResult.totalQuestions} câu.
                          </small>
                        </div>
                        <p>
                          {activeQuizResult.scorePercent > 70
                            ? 'Đạt yêu cầu trên 7 điểm. Tuần học này được đánh dấu hoàn thành.'
                            : 'Chưa đạt yêu cầu trên 7 điểm. Tuần học chưa được đánh dấu hoàn thành, bạn có thể làm lại quiz.'}
                        </p>
                        {activeQuizResult.wrongQuestions.length > 0 ? (
                          <>
                            <p>Lỗi sai</p>
                            <ol>
                              {activeQuizResult.wrongQuestions.map((item) => (
                                <li key={item.id}>
                                  <b>{item.question}</b>
                                  <span>Bạn chọn: {item.selectedAnswer}</span>
                                  <span>Đáp án đúng: {item.correctAnswer}</span>
                                </li>
                              ))}
                            </ol>
                            <p>Cần học kỹ lại</p>
                            <ul>
                              {activeQuizResult.reviewTopics.map((topic) => (
                                <li key={topic}>{topic}</li>
                              ))}
                            </ul>
                          </>
                        ) : activeQuizResult.answeredCount === activeQuizResult.totalQuestions ? (
                          <p>Bạn đã hoàn thành quiz. Tuần học này được đánh dấu hoàn thành.</p>
                        ) : (
                          <p>Bạn đã nộp quiz. Các câu chưa trả lời được tính là chưa hoàn thành.</p>
                        )}
                      </div>
                    )}
                    {activeQuiz.questions.map((quizQuestion, questionIndex) => {
                      const selectedIndex = activeQuizAnswers[quizQuestion.id]
                      const hasAnswered = typeof selectedIndex === 'number'
                      const isCorrect = isActiveQuizSubmitted && hasAnswered && selectedIndex === quizQuestion.correctIndex

                      return (
                        <div className="quiz-question" key={quizQuestion.id}>
                          <div className="quiz-question-title">
                            <div className="quiz-question-meta">
                              <span>Câu {questionIndex + 1}</span>
                              <span>{quizDifficultyLabel(quizQuestion.difficulty)}</span>
                              <span>{quizSkillLabel(quizQuestion.skillType)}</span>
                            </div>
                            <strong>{quizQuestion.question}</strong>
                          </div>
                          <div className="quiz-options">
                            {quizQuestion.options.map((option, optionIndex) => {
                              const isSelected = selectedIndex === optionIndex
                              const isAnswer = isActiveQuizSubmitted && quizQuestion.correctIndex === optionIndex
                              const optionClass = [
                                isSelected ? 'selected' : '',
                                isAnswer ? 'correct' : '',
                                isActiveQuizSubmitted && hasAnswered && isSelected && !isCorrect ? 'wrong' : ''
                              ]
                                .filter(Boolean)
                                .join(' ')

                              return (
                                <button
                                  className={optionClass}
                                  disabled={!isActiveQuizStarted || hasAnswered || isActiveQuizSubmitted}
                                  key={`${quizQuestion.id}-${optionIndex}`}
                                  type="button"
                                  onClick={() => chooseQuizAnswer(quizQuestion.id, optionIndex)}
                                >
                                  <b>{String.fromCharCode(65 + optionIndex)}</b>
                                  <span>{option}</span>
                                </button>
                              )
                            })}
                          </div>
                          {isActiveQuizSubmitted && hasAnswered && (
                            <p className={isCorrect ? 'quiz-feedback correct' : 'quiz-feedback wrong'}>
                              {isCorrect ? 'Đúng rồi.' : `Chưa đúng. Đáp án đúng là ${String.fromCharCode(65 + quizQuestion.correctIndex)}.`} {quizQuestion.explanation}
                            </p>
                          )}
                          {isActiveQuizSubmitted && quizQuestion.sourceTimestamp && (
                            <button className="quiz-source-link" type="button" onClick={() => activeVideoLesson && playVideoAt(activeVideoLesson.id, quizQuestion.sourceStartSeconds || 0)}>
                              Xem lại video: {quizQuestion.sourceTitle || 'Đoạn liên quan'} ({quizQuestion.sourceTimestamp})
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : activeQuiz ? (
                  <div className="quiz-start-card">
                    <strong>Sẵn sàng làm bài kiểm tra tuần {activeVideoLesson.week}</strong>
                    <p>Bấm Bắt đầu để mở câu hỏi. Trong lúc làm quiz, các tab khác và phần hỏi đáp sẽ bị khóa. Điểm số và đáp án chỉ hiện sau khi bấm Hoàn thành.</p>
                  </div>
                ) : (
                  <p className="quiz-empty">Bấm Tạo bài kiểm tra để sinh bài tập đánh giá trình độ theo đúng chủ đề của tuần học.</p>
                )}
              </>
            ) : (
              <div className="empty-state">Chọn một bài học để làm quiz.</div>
            )}
          </section>
        </section>
      ) : (
        <section className="chat-workspace">
          <aside className="panel chat-sidebar">
            <div className="panel-heading">
              <BookOpen size={18} />
              <h2>Chủ đề hỏi đáp</h2>
            </div>

            {chatTopics.length === 0 ? (
              <div className="empty-state compact">Tạo lộ trình học trước để mở không gian hỏi đáp.</div>
            ) : (
              chatTopics.map((topic) => {
                const isExpanded = Boolean(expandedChatTopicIds[topic.id])
                return (
                  <div className="chat-topic-group" key={topic.id}>
                    <button className={`topic-button ${activeChatTopicId === topic.id ? 'active' : ''}`} type="button" onClick={() => toggleChatTopic(topic)}>
                      <strong>{topic.topic}</strong>
                      <span>{topic.lessons.length} bài học</span>
                    </button>
                    {isExpanded && (
                      <div className="chat-lesson-list">
                        {topic.lessons.map((lesson) => {
                          const sessions = chatSessionsByLesson[lesson.id] || []
                          const isActiveLesson = activeChatLessonId === lesson.id
                          const count = sessions.reduce((total, session) => total + session.messages.filter((message) => !isLessonSupportMessage(message)).length, 0)
                          return (
                            <div className="chat-lesson-group" key={lesson.id}>
                              <button
                                className={isActiveLesson ? 'active' : ''}
                                type="button"
                                onClick={() => selectChatLesson(topic, lesson)}
                              >
                                <span>Tuần {lesson.week}: {lesson.title}</span>
                                <small>{sessions.length || 1} phiên · {count} tin</small>
                              </button>
                              {isActiveLesson && (
                                <div className="chat-session-list">
                                  {sessions.map((session) => (
                                    <button
                                      className={selectedChatSession?.id === session.id ? 'active' : ''}
                                      key={session.id}
                                      type="button"
                                      onClick={() => selectChatSession(lesson, session.id)}
                                    >
                                      <span>{session.title}</span>
                                      <small>{session.messages.filter((message) => !isLessonSupportMessage(message)).length} tin</small>
                                    </button>
                                  ))}
                                  <button className="new-chat-session" type="button" onClick={() => startNewChatSession(lesson)}>
                                    + Phiên mới
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </aside>

          <section className="panel chat-main">
            {selectedChatLesson ? (
              <>
                <div className="chat-main-header">
                  <div>
                    <p className="eyebrow">Hỏi đáp theo chủ đề</p>
                    <h2>{selectedChatLesson.title}</h2>
                    <p>{selectedChatTopic?.goal}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => setView('plan')}>
                    Quay lại lộ trình
                  </button>
                </div>

                <div className="chat-context">
                  <strong>Ngữ cảnh bài học</strong>
                  <p>{selectedChatLesson.objective}</p>
                  <p>{selectedChatLesson.checkpoint}</p>
                </div>

                <div className="quick-support chat-quick-support">
                  <button type="button" disabled={isAsking || isQuizInProgress} onClick={() => sendTutorQuestion(`Giải thích dễ hiểu hơn bài "${selectedChatLesson.title}"`)}>
                    Giải thích
                  </button>
                  <button type="button" disabled={isAsking || isQuizInProgress} onClick={() => sendTutorQuestion(`Cho tôi một ví dụ thực hành cho bài "${selectedChatLesson.title}"`)}>
                    Ví dụ
                  </button>
                  <button type="button" disabled={isAsking || isQuizInProgress} onClick={() => sendTutorQuestion(`Kiểm tra tôi bằng 3 câu hỏi ngắn về bài "${selectedChatLesson.title}"`)}>
                    Kiểm tra
                  </button>
                  <button type="button" disabled={isAsking || isQuizInProgress} onClick={() => sendTutorQuestion(`Tôi nên xem lại phút nào, đoạn nào trong video cho bài "${selectedChatLesson.title}"?`)}>
                    Timestamp
                  </button>
                </div>

                <div className="chat-history-heading">
                  <div>
                    <h3>Lịch sử đoạn chat</h3>
                    <p>{selectedChatTopic?.topic} / {selectedChatLesson.title} / {selectedChatSession?.title || 'Phiên chat'}</p>
                  </div>
                  <span>{chatMessageCount} tin nhắn</span>
                </div>

                <div className="chat-log full" ref={chatLogRef}>
                  {messages.length === 0 ? (
                    <div className="empty-state compact">Chưa có lịch sử chat cho bài học này.</div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`message ${message.role}`}>
                        {message.role === 'assistant' ? <AssistantMessage content={message.content} /> : message.content}
                      </div>
                    ))
                  )}
                  {isAsking && (
                    <div className="message assistant pending">
                      <Loader2 className="spin" size={16} />
                      Đang trả lời...
                    </div>
                  )}
                  <div className="chat-scroll-anchor" ref={chatEndRef} />
                </div>

                <form className="chat-form" onSubmit={askTutor}>
                  <input value={question} disabled={isQuizInProgress} onChange={(event) => setQuestion(event.target.value)} placeholder={isQuizInProgress ? 'Hoàn thành quiz trước khi hỏi đáp...' : 'Hỏi đáp về bài học này...'} />
                  <button type="submit" disabled={!selectedChatLesson || isAsking || isQuizInProgress}>
                    <CheckCircle2 size={18} />
                  </button>
                </form>

                <button className="secondary-button" type="button" onClick={clearCurrentChat}>
                  <RotateCcw size={16} />
                  Xóa chat của bài này
                </button>
              </>
            ) : (
              <div className="empty-state">Chọn một chủ đề hoặc bài học trong sidebar để bắt đầu hỏi đáp.</div>
            )}
          </section>
        </section>
      )}
      {editingScheduleEvent && (
        <div className="schedule-modal-backdrop" role="presentation" onMouseDown={() => setEditingScheduleEvent(null)}>
          <form className="schedule-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveScheduleEvent}>
            <div className="schedule-modal-head">
              <div>
                <p className="eyebrow">Chỉnh sửa buổi học</p>
                <h2>{editingScheduleEvent.title}</h2>
              </div>
              <button type="button" onClick={() => setEditingScheduleEvent(null)} aria-label="Đóng">
                ×
              </button>
            </div>
            <label>
              Tên buổi học
              <input name="title" defaultValue={editingScheduleEvent.title} />
            </label>
            <div className="three-cols">
              <label>
                Ngày học
                <input name="date" type="date" defaultValue={formatInputDate(scheduleEventDate(editingScheduleEvent))} />
              </label>
              <label>
                Bắt đầu
                <input name="start" type="time" defaultValue={editingScheduleEvent.start} />
              </label>
              <label>
                Kết thúc
                <input name="end" type="time" defaultValue={editingScheduleEvent.end} />
              </label>
            </div>
            <label>
              Trạng thái học
              <select name="status" defaultValue={editingScheduleEvent.status || 'planned'}>
                <option value="planned">Đã lên lịch</option>
                <option value="done">Đã học</option>
                <option value="skipped">Bỏ qua</option>
              </select>
            </label>
            <label>
              Ghi chú
              <textarea name="note" defaultValue={editingScheduleEvent.note || ''} rows={3} />
            </label>
            <div className="schedule-modal-actions">
              <button className="danger-button" type="button" onClick={() => removeScheduleEvent(editingScheduleEvent.id)}>
                Xóa
              </button>
              <button className="secondary-button" type="button" onClick={() => setEditingScheduleEvent(null)}>
                Hủy
              </button>
              <button className="primary-button" type="submit">
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}
      {duplicatePlanPrompt && (
        <div className="schedule-modal-backdrop" role="presentation" onMouseDown={cancelDuplicatePlanPrompt}>
          <section className="schedule-modal duplicate-plan-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-plan-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="schedule-modal-head">
              <div>
                <p className="eyebrow">Cảnh báo</p>
                <h2 id="duplicate-plan-title">Tên lộ trình đã tồn tại</h2>
              </div>
              <button type="button" onClick={cancelDuplicatePlanPrompt} aria-label="Đóng">
                ×
              </button>
            </div>
            <p>
              Bạn đã có lộ trình <strong>{duplicatePlanPrompt.existingPlan.profile.topic}</strong>. Hãy chọn cách xử lý trước khi tạo lộ trình mới.
            </p>
            <div className="duplicate-plan-actions">
              <button className="secondary-button" type="button" disabled={isGenerating} onClick={keepDuplicatePlan}>
                Giữ lại cả 2
              </button>
              <button className="danger-button" type="button" disabled={isGenerating} onClick={replaceDuplicatePlan}>
                Thay thế
              </button>
              <button className="secondary-button" type="button" disabled={isGenerating} onClick={cancelDuplicatePlanPrompt}>
                Quay lại
              </button>
            </div>
          </section>
        </div>
      )}
      {planDeleteCandidate && (
        <div className="schedule-modal-backdrop" role="presentation" onMouseDown={() => setPlanDeleteCandidate(null)}>
          <section className="schedule-modal delete-plan-modal" role="dialog" aria-modal="true" aria-labelledby="delete-plan-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="schedule-modal-head">
              <div>
                <p className="eyebrow">Cảnh báo</p>
                <h2 id="delete-plan-title">Xóa lộ trình học?</h2>
              </div>
              <button type="button" onClick={() => setPlanDeleteCandidate(null)} aria-label="Đóng">
                ×
              </button>
            </div>
            <p>
              Bạn sắp xóa lộ trình <strong>{planDeleteCandidate.profile.topic}</strong>. Lịch học, video đã phân tích, quiz và lịch sử chat liên quan đến lộ trình này cũng sẽ bị xóa.
            </p>
            <div className="schedule-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setPlanDeleteCandidate(null)}>
                Hủy
              </button>
              <button className="danger-button" type="button" onClick={confirmDeleteSavedPlan}>
                Xóa lộ trình
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function buildChatTopic(plan: LearningPlan): ChatTopic {
  return {
    id: plan.storageId ? planStorageId(plan) : stableTopicId(plan.profile),
    topic: plan.profile.topic,
    goal: plan.profile.goal,
    title: plan.title,
    profile: plan.profile,
    lessons: plan.lessons
  }
}

function upsertChatTopic(current: ChatTopic[], nextTopic: ChatTopic) {
  const existingIndex = current.findIndex((topic) => topic.id === nextTopic.id)
  if (existingIndex === -1) return [nextTopic, ...current]
  return current.map((topic, index) => (index === existingIndex ? nextTopic : topic))
}

function topicToPlan(topic: ChatTopic): LearningPlan {
  return {
    title: topic.title,
    summary: topic.goal,
    prerequisites: [],
    prerequisiteGraph: [],
    recommendedWeeks: topic.lessons.length,
    durationAdvice: '',
    profile: topic.profile,
    lessons: topic.lessons
  }
}

function upsertSavedPlan(current: LearningPlan[], nextPlan: LearningPlan) {
  const normalized = normalizeLoadedPlan(nextPlan)
  return [normalized, ...current.filter((item) => planStorageId(item) !== planStorageId(normalized))].slice(0, 8)
}

function omitRecordKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

function filterRecordByKeys<T>(record: Record<string, T>, keys: Set<string>, keepMatching: boolean) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => (keepMatching ? keys.has(key) : !keys.has(key))))
}

function filterRecordByPrefix<T>(record: Record<string, T>, prefix: string, keepMatching: boolean) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => (keepMatching ? key.startsWith(prefix) : !key.startsWith(prefix))))
}

function videoStateKey(plan: LearningPlan, lesson: Lesson) {
  return `${planStorageId(plan)}:${lesson.id}`
}

function getLessonScopedValue<T>(record: Record<string, T>, plan: LearningPlan, lesson: Lesson, fallback: T): T {
  return record[videoStateKey(plan, lesson)] ?? fallback
}

function pruneChatDataForPlans(plans: LearningPlan[], topics: ChatTopic[], history: ChatHistoryByLesson) {
  const validTopicIds = new Set(plans.map((item) => buildChatTopic(item).id))
  const validLessonIds = new Set(plans.flatMap((item) => item.lessons.map((lesson) => lesson.id)))
  return {
    topics: topics.filter((topic) => validTopicIds.has(topic.id)),
    history: filterRecordByKeys(history, validLessonIds, true)
  }
}

function normalizeChatSessionsByLesson(legacyHistory: ChatHistoryByLesson, sessions: ChatSessionsByLesson): ChatSessionsByLesson {
  const next: ChatSessionsByLesson = {}
  const lessonIds = new Set([...Object.keys(legacyHistory), ...Object.keys(sessions)])
  lessonIds.forEach((lessonId) => {
    const currentSessions = sessions[lessonId]
    if (Array.isArray(currentSessions) && currentSessions.length > 0) {
      next[lessonId] = currentSessions
        .filter((session) => session && Array.isArray(session.messages))
        .map((session, index) => ({
          id: session.id || stableChatSessionId(lessonId, index),
          title: normalizeChatSessionTitle(session.title, session.messages),
          createdAt: session.createdAt || new Date().toISOString(),
          updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
          messages: session.messages
        }))
      return
    }

    const messages = legacyHistory[lessonId] || []
    if (messages.length > 0) {
      next[lessonId] = [
        {
          id: stableChatSessionId(lessonId, 0),
          title: 'Phiên chat cũ',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages
        }
      ]
    }
  })
  return next
}

function pruneActiveChatSessionIds(activeIds: Record<string, string>, sessions: ChatSessionsByLesson) {
  return Object.fromEntries(Object.entries(activeIds).filter(([lessonId, sessionId]) => sessions[lessonId]?.some((session) => session.id === sessionId)))
}

function stableChatSessionId(lessonId: string, index: number) {
  return `${lessonId}-chat-${index + 1}`
}

function createChatSession(lesson: Lesson, index: number): ChatSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'Chưa có câu hỏi',
    createdAt: now,
    updatedAt: now,
    messages: [buildLessonSupportMessage(lesson)]
  }
}

function buildChatSessionTitle(session: ChatSession, messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim()
  if (!firstUserMessage) return session.title
  return firstUserMessage.length > 42 ? `${firstUserMessage.slice(0, 39)}...` : firstUserMessage
}

function normalizeChatSessionTitle(title: string | undefined, messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim()
  if (firstUserMessage) return firstUserMessage.length > 42 ? `${firstUserMessage.slice(0, 39)}...` : firstUserMessage
  if (title && !/^Phiên chat/i.test(title.trim())) return title
  return 'Chưa có câu hỏi'
}

function sameTopicIds(left: ChatTopic[], right: ChatTopic[]) {
  if (left.length !== right.length) return false
  return left.every((topic, index) => topic.id === right[index]?.id)
}

function sameRecordKeys<T>(left: Record<string, T>, right: Record<string, T>) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
}

function legacyLessonMap<T>(plan: LearningPlan | null, value: T | null | undefined): Record<string, T> {
  const firstLessonId = plan?.lessons[0]?.id
  if (!firstLessonId || value === null || value === undefined || value === '') return {}
  return { [firstLessonId]: value as T }
}

function planStorageId(plan: LearningPlan) {
  if (plan.storageId) return plan.storageId
  return slugify(`${plan.profile.topic}-${plan.profile.goal}-${plan.profile.durationWeeks}-${plan.profile.videoLanguage}`)
}

function withUniquePlanStorageId(plan: LearningPlan): LearningPlan {
  const storageId = `${slugify(`${plan.profile.topic}-${plan.profile.goal}-${plan.profile.durationWeeks}-${plan.profile.videoLanguage}`)}-${Date.now().toString(36)}`
  return { ...plan, storageId }
}

function findDuplicateSavedPlanByTopic(plans: LearningPlan[], topic: string) {
  const normalizedTopic = normalizeSearchText(topic)
  if (!normalizedTopic) return null
  return plans.find((item) => normalizeSearchText(item.profile.topic) === normalizedTopic) || null
}

function videoJobKey(plan: LearningPlan, lesson: Lesson) {
  return `${planStorageId(plan)}:${lesson.id}:${plan.profile.videoLanguage}`
}

function normalizeLoadedPlan(plan: LearningPlan): LearningPlan {
  const profile = normalizeLoadedProfile(plan.profile)
  const lessons = normalizeLessonList(plan.lessons || [], profile)
  return {
    ...plan,
    profile,
    lessons: rebalanceLessonDurations(lessons, profile)
  }
}

function isLearningPlanLike(value: unknown): value is LearningPlan {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as Partial<LearningPlan>).lessons))
}

function normalizeLoadedProfile(profile: LearnerProfile): LearnerProfile {
  return {
    ...initialProfile,
    ...profile,
    learningTimePreference:
      profile.learningTimePreference === 'morning' || profile.learningTimePreference === 'noon' || profile.learningTimePreference === 'afternoon' || profile.learningTimePreference === 'evening'
        ? profile.learningTimePreference
        : 'evening',
    videoLanguage: profile.videoLanguage === 'en' || profile.videoLanguage === 'vi' ? profile.videoLanguage : 'vi'
  }
}

function normalizeLessonList(lessons: Lesson[], profile: LearnerProfile) {
  const seenIds = new Set<string>()
  const seenContent = new Set<string>()

  return lessons.map((lesson, index) => {
    const contentKey = normalizeSearchText(`${lesson.title} ${lesson.objective}`)
    const duplicateContent = seenContent.has(contentKey)
    seenContent.add(contentKey)

    const baseId = lesson.id?.trim() || `lesson-${index + 1}`
    const uniqueId = seenIds.has(baseId) ? `${baseId}-${index + 1}` : baseId
    seenIds.add(uniqueId)

    return {
      ...lesson,
      id: uniqueId,
      week: index + 1,
      title: duplicateContent ? `Tuần ${index + 1}: ${profile.topic}` : lesson.title,
      objective: duplicateContent ? `Học phần tiếp theo của ${profile.topic} theo mục tiêu: ${profile.goal}.` : lesson.objective,
      status: lesson.status || 'todo'
    }
  })
}

function rebalanceLessonDurations(lessons: Lesson[], profile: LearnerProfile) {
  if (lessons.length === 0) return lessons
  const totalMinutes = Math.max(lessons.length * 30, Math.round(profile.durationWeeks * profile.hoursPerWeek * 60))
  const weights = lessons.map((lesson) => lessonDurationWeight(lesson.pacing))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || lessons.length
  const rounded = weights.map((weight) => Math.max(30, Math.round((totalMinutes * weight) / totalWeight / 5) * 5))
  const delta = totalMinutes - rounded.reduce((sum, value) => sum + value, 0)
  rounded[rounded.length - 1] = Math.max(30, rounded[rounded.length - 1] + delta)

  return lessons.map((lesson, index) => ({
    ...lesson,
    durationMinutes: rounded[index]
  }))
}

function lessonDurationWeight(pacing: Lesson['pacing']) {
  if (pacing === 'deep') return 1.35
  if (pacing === 'skim') return 0.65
  return 1
}

function buildInitialSchedule(lessons: Lesson[], preference: LearnerProfile['learningTimePreference'] = 'evening'): ScheduleEvent[] {
  return buildParallelSchedule([
    {
      title: 'Lộ trình hiện tại',
      summary: '',
      prerequisites: [],
      prerequisiteGraph: [],
      recommendedWeeks: lessons.length,
      durationAdvice: '',
      profile: { ...initialProfile, learningTimePreference: preference },
      lessons
    }
  ])
}

function buildParallelSchedule(plans: LearningPlan[]): ScheduleEvent[] {
  const occupied = new Set<string>()
  const events: ScheduleEvent[] = []
  const dayPattern = ['Thứ 2', 'Thứ 3', 'Thứ 5', 'Thứ 7', 'Thứ 4', 'Thứ 6', 'Chủ nhật']

  plans.forEach((sourcePlan, planIndex) => {
    const planId = planStorageId(sourcePlan)
    const preferredStart = preferredScheduleStart[sourcePlan.profile.learningTimePreference]
    const slotOrder = buildPreferredSlotOrder(preferredStart)

    sourcePlan.lessons.forEach((lesson, lessonIndex) => {
      const mainMinutes = Math.min(120, Math.max(60, Math.round(lesson.durationMinutes * 0.45)))
      const practiceMinutes = Math.min(75, Math.max(45, Math.round(lesson.durationMinutes * 0.25)))
      const seed = planIndex * 2 + lessonIndex
      const study = findOpenScheduleSlot(occupied, lesson.week, dayPattern, slotOrder, seed)
      const practice = findOpenScheduleSlot(occupied, lesson.week, dayPattern, slotOrder, seed + 2)
      const review = findOpenScheduleSlot(occupied, lesson.week, dayPattern, slotOrder, seed + 4)

      events.push(
        {
          id: `study-${planId}-${lesson.id}`,
          planId,
          planTitle: sourcePlan.profile.topic,
          lessonId: lesson.id,
          week: lesson.week,
          title: `${sourcePlan.profile.topic}: ${lesson.title}`,
          day: study.day,
          start: study.start,
          end: addMinutesToTime(study.start, mainMinutes),
          kind: 'study'
        },
        {
          id: `practice-${planId}-${lesson.id}`,
          planId,
          planTitle: sourcePlan.profile.topic,
          lessonId: lesson.id,
          week: lesson.week,
          title: `Thực hành: ${sourcePlan.profile.topic} / ${lesson.title}`,
          day: practice.day,
          start: practice.start,
          end: addMinutesToTime(practice.start, practiceMinutes),
          kind: 'practice'
        },
        {
          id: `review-${planId}-${lesson.id}`,
          planId,
          planTitle: sourcePlan.profile.topic,
          lessonId: lesson.id,
          week: lesson.week,
          title: `Quiz: ${sourcePlan.profile.topic} / ${lesson.title}`,
          day: review.day,
          start: review.start,
          end: addMinutesToTime(review.start, 30),
          kind: 'review'
        }
      )
    })
  })

  return events
}

function buildPreferredSlotOrder(preferredStart: string) {
  const preferredIndex = Math.max(0, scheduleSlots.indexOf(preferredStart))
  return [...scheduleSlots].sort((left, right) => Math.abs(scheduleSlots.indexOf(left) - preferredIndex) - Math.abs(scheduleSlots.indexOf(right) - preferredIndex))
}

function findOpenScheduleSlot(occupied: Set<string>, week: number, days: string[], slots: string[], seed: number) {
  for (let offset = 0; offset < days.length * slots.length; offset += 1) {
    const day = days[(seed + offset) % days.length]
    const start = slots[Math.floor((seed + offset) / days.length) % slots.length]
    const key = `${week}-${day}-${start}`
    if (!occupied.has(key)) {
      occupied.add(key)
      return { day, start }
    }
  }

  return { day: days[0], start: slots[0] }
}

function addMinutesToTime(value: string, minutes: number) {
  const [hour, minute] = value.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const nextHour = Math.floor(total / 60) % 24
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + diff)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function buildScheduleWeekDates(week: number) {
  const monday = addDays(scheduleBaseMonday, (Math.max(1, week) - 1) * 7)
  return scheduleDays.map((day, index) => ({
    day,
    date: addDays(monday, index)
  }))
}

function buildMonthCalendar(monthDate: Date, events: ScheduleEvent[]) {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = addDays(startOfWeek(monthEnd), 6)
  const days = []

  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    const key = dateKey(day)
    days.push({
      key,
      date: day,
      isCurrentMonth: day.getMonth() === monthStart.getMonth(),
      events: events.filter((event) => dateKey(scheduleEventDate(event)) === key).sort((left, right) => left.start.localeCompare(right.start))
    })
  }

  return {
    id: monthKey(monthStart),
    days
  }
}

function buildDayTimelineLayout(events: ScheduleEvent[]) {
  const minuteHeight = 1.1
  const timelineStart = timeToMinutes(dayTimelineSlots[0] || '06:00')
  const sorted = [...events].sort((left, right) => {
    const startDelta = timeToMinutes(left.start) - timeToMinutes(right.start)
    if (startDelta !== 0) return startDelta
    return timeToMinutes(left.end) - timeToMinutes(right.end)
  })

  const layouts: Array<{ event: ScheduleEvent; column: number; columnCount: number; top: number; height: number }> = []
  const active: Array<{ end: number; column: number }> = []

  sorted.forEach((event) => {
    const start = timeToMinutes(event.start)
    const end = Math.max(start + 30, timeToMinutes(event.end))

    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= start) active.splice(index, 1)
    }

    let column = 0
    while (active.some((item) => item.column === column)) column += 1
    active.push({ end, column })

    const top = Math.max(0, Math.round((start - timelineStart) * minuteHeight))
    const height = Math.max(34, Math.round((end - start) * minuteHeight) - 4)

    layouts.push({
      event,
      column,
      columnCount: Math.max(...active.map((item) => item.column), column) + 1,
      top,
      height
    })
  })

  return layouts.map((layout) => {
    const layoutStart = timeToMinutes(layout.event.start)
    const layoutEnd = Math.max(layoutStart + 30, timeToMinutes(layout.event.end))
    const overlapping = layouts.filter((candidate) => {
      const candidateStart = timeToMinutes(candidate.event.start)
      const candidateEnd = Math.max(candidateStart + 30, timeToMinutes(candidate.event.end))
      return candidateStart < layoutEnd && candidateEnd > layoutStart
    })

    return {
      ...layout,
      columnCount: Math.max(layout.columnCount, overlapping.reduce((max, item) => Math.max(max, item.column + 1), 1))
    }
  })
}

function scheduleWeekFromDate(date: Date) {
  const diffMs = startOfWeek(date).getTime() - scheduleBaseMonday.getTime()
  return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function sameDate(left: Date, right: Date) {
  return dateKey(left) === dateKey(right)
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function startOfMonth(date: Date) {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  next.setHours(0, 0, 0, 0)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function scheduleEventDate(event: ScheduleEvent) {
  const dayIndex = Math.max(0, scheduleDays.indexOf(event.day))
  return addDays(scheduleBaseMonday, (Math.max(1, event.week) - 1) * 7 + dayIndex)
}

function buildScheduleMonths(plans: LearningPlan[], events: ScheduleEvent[], activePlanId: string | null) {
  const relevantEvents = events.filter((event) => !activePlanId || event.planId === activePlanId)
  const maxWeek = Math.max(1, ...plans.filter((sourcePlan) => !activePlanId || planStorageId(sourcePlan) === activePlanId).flatMap((sourcePlan) => sourcePlan.lessons.map((lesson) => lesson.week)))
  const eventDates = relevantEvents.map(scheduleEventDate).sort((left, right) => left.getTime() - right.getTime())
  const firstDate = eventDates[0] || scheduleBaseMonday
  const lastDate = eventDates[eventDates.length - 1] || addDays(scheduleBaseMonday, (maxWeek - 1) * 7 + 6)
  const firstMonth = startOfMonth(firstDate)
  const lastMonth = startOfMonth(lastDate)
  const months = []

  for (let cursor = firstMonth; cursor <= lastMonth; cursor = addMonths(cursor, 1)) {
    const monthStart = startOfMonth(cursor)
    const monthEnd = endOfMonth(cursor)
    const gridStart = startOfWeek(monthStart)
    const gridEnd = addDays(startOfWeek(monthEnd), 6)
    const days = []

    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
      const key = dateKey(day)
      days.push({
        key,
        date: day,
        isCurrentMonth: day.getMonth() === monthStart.getMonth(),
        events: events
          .filter((event) => dateKey(scheduleEventDate(event)) === key)
          .sort((left, right) => left.start.localeCompare(right.start))
      })
    }

    months.push({
      id: monthKey(monthStart),
      label: new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(monthStart),
      events: relevantEvents.filter((event) => monthKey(scheduleEventDate(event)) === monthKey(monthStart)),
      days
    })
  }

  return months
}

function formatCalendarDate(date: Date) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date)
}

function formatInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateRange(start: Date, end: Date) {
  return `${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(end)}`
}

function formatScheduleHeaderTitle(view: CalendarViewMode, calendarMonthDate: Date, selectedScheduleDate: Date) {
  if (view === 'day') {
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(selectedScheduleDate)
  }

  if (view === 'week') {
    const weekStart = startOfWeek(selectedScheduleDate)
    const weekEnd = addDays(weekStart, 6)
    return `Tuần ${formatDateRange(weekStart, weekEnd)}`
  }

  return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(calendarMonthDate)
}

function scheduleNavigationLabel(view: CalendarViewMode, offset: number) {
  const direction = offset < 0 ? 'trước' : 'sau'
  if (view === 'day') return `Ngày ${direction}`
  if (view === 'week') return `Tuần ${direction}`
  return `Tháng ${direction}`
}

function shortScheduleTitle(title: string) {
  return title
    .replace(/^([^:]+):\s*/, '')
    .replace(/^(Quiz|Thực hành|Ôn tập):\s*/i, '')
    .replace(/\s*\/\s*/g, ' · ')
    .slice(0, 64)
}

function setScheduleDragPreview(event: DragEvent<HTMLElement>, label: string) {
  const preview = document.createElement('div')
  preview.className = 'schedule-drag-preview'
  preview.textContent = label
  document.body.appendChild(preview)
  event.dataTransfer.setDragImage(preview, 18, 18)
  requestAnimationFrame(() => {
    preview.remove()
  })
}

function secondsToTimestamp(value: number) {
  const total = Math.max(0, Math.floor(value))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function selectDistinctVideoMatches(lessons: Lesson[], analysis: VideoAnalysis, activeLessonId: string): VideoSearchMatch[] {
  const usedSegmentIds = new Set<string>()

  for (const lesson of lessons) {
    const matches = analysis.matchesByLessonId[lesson.id] || []
    const selected = matches.filter((match) => !usedSegmentIds.has(match.id))
    selected.forEach((match) => usedSegmentIds.add(match.id))

    if (lesson.id === activeLessonId) return selected
  }

  return []
}

function buildQuizVideoMatches(analysis: VideoAnalysis, lessonId: string, activeMatches: VideoSearchMatch[]) {
  if (activeMatches.length > 0) return activeMatches.slice(0, 10)
  const lessonMatches = analysis.matchesByLessonId[lessonId] || []
  if (lessonMatches.length > 0) return lessonMatches.slice(0, 10)

  return analysis.video.segments.slice(0, 10).map((segment) => ({
    ...segment,
    score: 0,
    url: withYoutubeStartTime(analysis.video.url, segment.startSeconds),
    videoTitle: analysis.video.title
  }))
}

function buildTutorVideoReferences(
  question: string,
  lesson: Lesson,
  topic: ChatTopic,
  analysisByLesson: Record<string, VideoAnalysis>
) {
  const scopedKey = `${planStorageId(topicToPlan(topic))}:${lesson.id}`
  const analysis = analysisByLesson[scopedKey] || analysisByLesson[lesson.id]
  if (!analysis) return []

  const lessonMatches = selectDistinctVideoMatches(topic.lessons, analysis, lesson.id)
  const lessonFallbackMatches = analysis.matchesByLessonId[lesson.id] || []
  const allVideoMatches = analysis.video.segments.map((segment) => ({
    ...segment,
    score: 0,
    url: withYoutubeStartTime(analysis.video.url, segment.startSeconds),
    videoTitle: analysis.video.title
  }))
  const matches = lessonMatches.length > 0 ? lessonMatches : lessonFallbackMatches.length > 0 ? lessonFallbackMatches : allVideoMatches

  return matches
    .map((match) => ({
      match,
      questionScore: scoreVideoReference(question, match)
    }))
    .sort((left, right) => right.questionScore - left.questionScore || right.match.score - left.match.score || left.match.startSeconds - right.match.startSeconds)
    .slice(0, 3)
    .map(({ match }) => ({
      timestamp: `${secondsToTimestamp(match.startSeconds)}-${secondsToTimestamp(match.endSeconds)}`,
      title: match.title,
      summary: match.summary,
      url: match.url,
      videoTitle: match.videoTitle,
      startSeconds: match.startSeconds,
      endSeconds: match.endSeconds,
      excerpt: match.text.slice(0, 700)
    }))
}

function scoreVideoReference(question: string, match: VideoSearchMatch) {
  const queryTokens = new Set(tokenizeSearchText(question))
  if (queryTokens.size === 0) return 0

  const targetTokens = tokenizeSearchText(`${match.title} ${match.summary} ${match.text}`)
  return targetTokens.reduce((score, token) => score + (queryTokens.has(token) ? 1 : 0), 0)
}

function withYoutubeStartTime(value: string, seconds: number) {
  const url = new URL(value)
  url.searchParams.set('t', `${Math.floor(seconds)}s`)
  return url.toString()
}

function youtubeEmbedUrl(value: string, startSeconds = 0) {
  const videoId = youtubeVideoId(value)
  if (!videoId) return ''

  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
  url.searchParams.set('rel', '0')
  url.searchParams.set('modestbranding', '1')
  if (startSeconds > 0) url.searchParams.set('start', String(Math.floor(startSeconds)))
  return url.toString()
}

function youtubeVideoId(value: string) {
  if (!value.trim()) return ''

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || ''
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/').filter(Boolean)[1] || ''
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] || ''
      return url.searchParams.get('v') || ''
    }
  } catch {
    return ''
  }

  return ''
}

function tokenizeSearchText(value: string) {
  return normalizeSearchText(value).split(/\s+/).filter((token) => token.length >= 2)
}

function quizDifficultyLabel(value: QuizQuestion['difficulty']) {
  if (value === 'advanced') return 'Nâng cao'
  return 'Cơ bản'
}

function quizSkillLabel(value: QuizQuestion['skillType']) {
  if (value === 'application') return 'Áp dụng'
  if (value === 'debugging') return 'Tìm lỗi'
  if (value === 'design') return 'Thiết kế'
  if (value === 'implementation') return 'Thực thi'
  return 'Khái niệm'
}

function buildQuizResult(quiz: LessonQuiz, answers: Record<string, number>) {
  const answeredQuestions = quiz.questions.filter((question) => typeof answers[question.id] === 'number')
  const wrongQuestions = answeredQuestions
    .filter((question) => answers[question.id] !== question.correctIndex)
    .map((question) => ({
      id: question.id,
      question: question.question,
      selectedAnswer: question.options[answers[question.id]] || 'Chưa rõ',
      correctAnswer: question.options[question.correctIndex] || 'Chưa rõ',
      explanation: question.explanation
    }))
  const correctCount = answeredQuestions.length - wrongQuestions.length
  const totalQuestions = quiz.questions.length || 1
  const reviewTopics = Array.from(
    new Set(
      wrongQuestions.map((item) => {
        const hint = item.explanation || item.correctAnswer || item.question
        return clampText(hint, 120)
      })
    )
  ).slice(0, 5)

  return {
    totalQuestions,
    answeredCount: answeredQuestions.length,
    correctCount,
    scorePercent: Math.round((correctCount / totalQuestions) * 100),
    wrongQuestions,
    reviewTopics
  }
}

function clampText(value: string, limit: number) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 3).trim()}...`
}

function formatVideoUiError(value: string) {
  if (/video is not available|this video is not available|not available/i.test(value)) {
    return 'Video YouTube này không khả dụng. Hãy bấm gợi ý lại hoặc dán URL video khác.'
  }
  if (/yt-dlp|Command failed|storyboard|fragments|formats|youtube/i.test(value)) {
    return 'Không lấy được dữ liệu video từ YouTube. Hãy thử video khác hoặc bấm gợi ý lại.'
  }
  return clampText(value.split('\n')[0] || 'Không xử lý được video.', 180)
}

function stableTopicId(profile: LearnerProfile) {
  return slugify(`${profile.topic}-${profile.goal}`)
}

function shouldSuggestTopic(topic: string, query: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false

  const normalizedTopic = normalizeSearchText(topic)
  if (normalizedTopic.startsWith(normalizedQuery)) return true

  return normalizedTopic.split(/\s+/).some((word) => word.startsWith(normalizedQuery))
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
}

function pacingLabel(pacing: Lesson['pacing']) {
  if (pacing === 'skim') return 'Học nhanh'
  if (pacing === 'deep') return 'Học kỹ'
  return 'Bình thường'
}

function learnerLevelLabel(level: LearnerProfile['level']) {
  if (level === 'advanced') return 'Nâng cao'
  if (level === 'intermediate') return 'Trung cấp'
  return 'Cơ bản'
}

function learningStyleLabel(style: LearnerProfile['learningStyle']) {
  if (style === 'concepts') return 'Khái niệm'
  if (style === 'practice') return 'Thực hành'
  if (style === 'project') return 'Project'
  return 'Kết hợp'
}

function lessonActionLabel(lesson: Lesson, isSelected: boolean) {
  if (isSelected) return 'Đang xem'
  if (lesson.status === 'doing') return 'Học tiếp'
  return 'Xem bài học'
}

function slugify(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'topic'
  )
}

function isLessonSupportMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.content.startsWith('### Tutor đang theo bài:')
}

function buildLessonSupportMessage(lesson: Lesson): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `### Tutor đang theo bài: ${lesson.title}

- Mục tiêu: ${lesson.objective}
- Checkpoint: ${lesson.checkpoint}
- Bạn có thể hỏi giải thích, xin ví dụ, hoặc bấm các nút gợi ý để được hỗ trợ theo đúng bài học này.`
  }
}

function AssetList({ icon, title, items }: { icon: ReactNode; title: string; items: unknown[] }) {
  if (!items.length) return null
  const normalizedItems = items.map(formatAssetItem).filter((item): item is FormattedAssetItem => Boolean(item))
  if (!normalizedItems.length) return null

  return (
    <div className="asset-list">
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <ul>
        {normalizedItems.map((item, index) => (
          <li key={`${title}-${index}-${item.text}-${item.url || ''}`}>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.text}
              </a>
            ) : (
              item.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

type FormattedAssetItem = {
  text: string
  url?: string
}

function formatAssetItem(item: unknown) {
  if (typeof item === 'string') return formatStringAssetItem(item)
  if (typeof item === 'number') return { text: String(item) }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    const title = firstString(record.title, record.name, record.text, record.label, record.description, record.reason, record.searchKeyword)
    const directUrl = firstString(record.url, record.link, record.href)
    const url = directUrl
    const detailParts = [
      firstString(record.type) ? `[${firstString(record.type)}]` : '',
      title,
      firstString(record.primaryLanguage) ? `Ngôn ngữ: ${firstString(record.primaryLanguage)}` : '',
      Array.isArray(record.englishKeywords) && record.englishKeywords.length ? `EN: ${record.englishKeywords.map(String).slice(0, 3).join(', ')}` : '',
      Array.isArray(record.vietnameseKeywords) && record.vietnameseKeywords.length ? `VI: ${record.vietnameseKeywords.map(String).slice(0, 3).join(', ')}` : '',
      firstString(record.whyRecommended)
    ].filter(Boolean)

    if (detailParts.length) return { text: detailParts.join(' - '), url: url || undefined }
    if (title && url) return { text: title, url }
    if (title) return { text: title }
    if (url) return { text: url, url }
  }

  return null
}

function hasConcreteRecommendedResourceUrl(url: unknown) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false

  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (host.includes('google.') && path === '/search') return false
    if ((host === 'www.youtube.com' || host === 'youtube.com') && path === '/results') return false
    if (host === 'www.bing.com' && path === '/search') return false
    if (host === 'search.yahoo.com') return false
    return true
  } catch {
    return false
  }
}

function formatStringAssetItem(item: string): FormattedAssetItem | null {
  const text = item.trim()
  if (!text) return null

  const url = text.match(/https?:\/\/[^\s)]+/)?.[0]
  if (!url) return { text }

  return {
    text: text.replace(url, '').replace(/\s*[-:]\s*$/, '').trim() || url,
    url
  }
}

function firstString(...values: unknown[]) {
  const found = values.find((value) => typeof value === 'string' && value.trim())
  return typeof found === 'string' ? found.trim() : ''
}

function AssistantMessage({ content }: { content: string }) {
  const blocks = parseMessageBlocks(content)

  return (
    <div className="assistant-message">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h3 key={index}>{renderInlineMarkdown(block.content)}</h3>
        }

        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          )
        }

        if (block.type === 'code') {
          return (
            <pre key={index}>
              <code>{block.content}</code>
            </pre>
          )
        }

        return <p key={index}>{renderInlineMarkdown(block.content)}</p>
      })}
    </div>
  )
}

type MessageBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'heading'; content: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; content: string }

function parseMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const lines = normalizeAssistantContent(content).replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  let code: string[] = []
  let inCode = false

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: 'paragraph', content: paragraph.join(' ') })
    paragraph = []
  }

  const flushList = () => {
    if (!list.length) return
    blocks.push({ type: 'list', items: list })
    list = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph()
      flushList()
      continue
    }

    if (trimmed.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', content: code.join('\n') })
        code = []
        inCode = false
      } else {
        flushParagraph()
        flushList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      code.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', content: trimmed.replace(/^#+\s*/, '') })
      continue
    }

    if (/^([-*]|\d+[.)])\s+/.test(trimmed)) {
      flushParagraph()
      list.push(trimmed.replace(/^([-*]|\d+[.)])\s+/, ''))
      continue
    }

    flushList()
    paragraph.push(cleanAssistantLine(trimmed))
  }

  flushParagraph()
  flushList()
  if (code.length) blocks.push({ type: 'code', content: code.join('\n') })

  return blocks
}

function normalizeAssistantContent(content: string) {
  return content
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*---+\s*$/gm, '')
}

function cleanAssistantLine(line: string) {
  return line
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^([-*]|\d+[.)])\s+/, '')
    .trim()
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = cleanAssistantLine(text).split(/(https?:\/\/[^\s)]+|`[^`]+`|\*\*[^*]+\*\*)/g)

  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a href={part} key={index} target="_blank" rel="noreferrer">
          {part}
        </a>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }

    return part
  })
}
