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
import type { ChatMessage, LearnerProfile, LearningPlan, Lesson, LessonQuiz, LessonStatus, VideoAnalysis, VideoRecommendation, VideoSearchMatch } from '@/lib/types'

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

const statusLabel: Record<LessonStatus, string> = {
  todo: 'Chưa học',
  doing: 'Đang học',
  done: 'Hoàn thành',
  review: 'Cần ôn'
}

const scheduleDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const scheduleSlots = ['07:00', '12:00', '14:00', '19:00']
const preferredScheduleStart = {
  morning: '07:00',
  noon: '12:00',
  afternoon: '14:00',
  evening: '19:00'
} satisfies Record<LearnerProfile['learningTimePreference'], string>

const storageKey = 'learnmate-app-state-v2'
const quizStorageVersion = 2

type AppView = 'plan' | 'schedule' | 'videos' | 'chat'
type ChatHistoryByLesson = Record<string, ChatMessage[]>
type ScheduleEvent = {
  id: string
  lessonId: string
  week: number
  title: string
  day: string
  start: string
  end: string
  kind: 'study' | 'review' | 'practice'
}
type ChatTopic = {
  id: string
  topic: string
  goal: string
  title: string
  profile: LearnerProfile
  lessons: Lesson[]
}

type PersistedAppState = {
  profile: LearnerProfile
  plan: LearningPlan | null
  savedPlans: LearningPlan[]
  selectedLessonId: string | null
  activeVideoLessonId: string | null
  youtubeUrlByLesson: Record<string, string>
  videoAnalysisByLesson: Record<string, VideoAnalysis>
  videoRecommendationByLesson: Record<string, VideoRecommendation>
  quizByLesson: Record<string, LessonQuiz>
  quizAnswersByLesson: Record<string, Record<string, number>>
  quizStorageVersion?: number
  youtubeUrl?: string
  videoAnalysis?: VideoAnalysis | null
  videoRecommendation?: VideoRecommendation | null
  scheduleEvents: ScheduleEvent[]
  activeScheduleWeek: number
  chatTopics: ChatTopic[]
  chatHistoryByLesson: ChatHistoryByLesson
}

export default function Home() {
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile)
  const [plan, setPlan] = useState<LearningPlan | null>(null)
  const [view, setView] = useState<AppView>('plan')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [activeScheduleWeek, setActiveScheduleWeek] = useState(1)
  const [activeVideoLessonId, setActiveVideoLessonId] = useState<string | null>(null)
  const [youtubeUrlByLesson, setYoutubeUrlByLesson] = useState<Record<string, string>>({})
  const [videoAnalysisByLesson, setVideoAnalysisByLesson] = useState<Record<string, VideoAnalysis>>({})
  const [videoRecommendationByLesson, setVideoRecommendationByLesson] = useState<Record<string, VideoRecommendation>>({})
  const [videoPlayerStartByLesson, setVideoPlayerStartByLesson] = useState<Record<string, number>>({})
  const [quizByLesson, setQuizByLesson] = useState<Record<string, LessonQuiz>>({})
  const [quizAnswersByLesson, setQuizAnswersByLesson] = useState<Record<string, Record<string, number>>>({})
  const [isQuizPanelOpen, setIsQuizPanelOpen] = useState(false)
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
  const [question, setQuestion] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [savedPlans, setSavedPlans] = useState<LearningPlan[]>([])
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false)
  const autoSuggestedVideoKeysRef = useRef<Set<string>>(new Set())
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
  const activeVideoLesson = useMemo(
    () => plan?.lessons.find((lesson) => lesson.id === activeVideoLessonId) || plan?.lessons[0] || null,
    [plan, activeVideoLessonId]
  )
  const activeVideoLessonIdKey = activeVideoLesson?.id || ''
  const youtubeUrl = activeVideoLessonIdKey ? youtubeUrlByLesson[activeVideoLessonIdKey] || '' : ''
  const videoAnalysis = activeVideoLessonIdKey ? videoAnalysisByLesson[activeVideoLessonIdKey] || null : null
  const videoRecommendation = activeVideoLessonIdKey ? videoRecommendationByLesson[activeVideoLessonIdKey] || null : null
  const activeVideoMatches = activeVideoLesson && videoAnalysis && plan ? selectDistinctVideoMatches(plan.lessons, videoAnalysis, activeVideoLesson.id) : []
  const activeVideoStartSeconds = activeVideoLessonIdKey ? videoPlayerStartByLesson[activeVideoLessonIdKey] || 0 : 0
  const activeYoutubeEmbedUrl = videoAnalysis ? youtubeEmbedUrl(videoAnalysis.video.url, activeVideoStartSeconds) : ''
  const activeQuiz = activeVideoLessonIdKey ? quizByLesson[activeVideoLessonIdKey] || null : null
  const activeQuizAnswers = activeVideoLessonIdKey ? quizAnswersByLesson[activeVideoLessonIdKey] || {} : {}
  const activeQuizResult = useMemo(() => (activeQuiz ? buildQuizResult(activeQuiz, activeQuizAnswers) : null), [activeQuiz, activeQuizAnswers])
  const visibleScheduleEvents = scheduleEvents.filter((event) => event.week === activeScheduleWeek)
  const messages = selectedChatLesson ? chatHistoryByLesson[selectedChatLesson.id] || [] : []
  const chatMessageCount = messages.filter((message) => !isLessonSupportMessage(message)).length
  const savedTopicOptions = chatTopics
    .filter((topic) => {
      const query = profile.topic.trim()
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
      setProfile(normalizeLoadedProfile(parsed.profile || initialProfile))
      setPlan(restoredPlan)
      setSavedPlans(Array.isArray(parsed.savedPlans) ? parsed.savedPlans.filter(isLearningPlanLike).map(normalizeLoadedPlan) : [])
      setSelectedLessonId(parsed.selectedLessonId || restoredPlan?.lessons[0]?.id || null)
      setActiveVideoLessonId(parsed.activeVideoLessonId || restoredPlan?.lessons[0]?.id || null)
      setYoutubeUrlByLesson(parsed.youtubeUrlByLesson || legacyLessonMap(restoredPlan, parsed.youtubeUrl || ''))
      setVideoAnalysisByLesson(parsed.videoAnalysisByLesson || legacyLessonMap(restoredPlan, parsed.videoAnalysis || null))
      setVideoRecommendationByLesson(parsed.videoRecommendationByLesson || legacyLessonMap(restoredPlan, parsed.videoRecommendation || null))
      setQuizByLesson(parsed.quizStorageVersion === quizStorageVersion ? parsed.quizByLesson || {} : {})
      setQuizAnswersByLesson(parsed.quizStorageVersion === quizStorageVersion ? parsed.quizAnswersByLesson || {} : {})
      setScheduleEvents(Array.isArray(parsed.scheduleEvents) ? parsed.scheduleEvents : restoredPlan ? buildInitialSchedule(restoredPlan.lessons, restoredPlan.profile.learningTimePreference) : [])
      setActiveScheduleWeek(parsed.activeScheduleWeek || restoredPlan?.lessons[0]?.week || 1)
      setChatTopics(Array.isArray(parsed.chatTopics) ? parsed.chatTopics : restoredPlan ? [buildChatTopic(restoredPlan)] : [])
      setChatHistoryByLesson(parsed.chatHistoryByLesson || {})
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

    const payload: PersistedAppState = {
      profile,
      plan,
      savedPlans,
      selectedLessonId,
      activeVideoLessonId,
      youtubeUrlByLesson,
      videoAnalysisByLesson,
      videoRecommendationByLesson,
      quizByLesson,
      quizAnswersByLesson,
      quizStorageVersion,
      scheduleEvents,
      activeScheduleWeek,
      chatTopics,
      chatHistoryByLesson
    }

    localStorage.setItem(storageKey, JSON.stringify(payload))
  }, [
    profile,
    plan,
    savedPlans,
    selectedLessonId,
    activeVideoLessonId,
    youtubeUrlByLesson,
    videoAnalysisByLesson,
    videoRecommendationByLesson,
    quizByLesson,
    quizAnswersByLesson,
    scheduleEvents,
    activeScheduleWeek,
    chatTopics,
    chatHistoryByLesson,
    hasLoadedStorage
  ])

  useEffect(() => {
    if (!hasLoadedStorage || !plan || isProcessingVideoBatch) return
    const planKey = planStorageId(plan)
    const alreadyStarted = plan.lessons.every((lesson) => autoSuggestedVideoKeysRef.current.has(videoJobKey(plan, lesson)))
    const hasMissingVideo = plan.lessons.some((lesson) => !videoAnalysisByLesson[lesson.id])
    if (!hasMissingVideo || alreadyStarted) return
    autoSuggestedVideoKeysRef.current.add(`batch:${planKey}`)
    void suggestAndAnalyzeAllVideos(plan)
  }, [hasLoadedStorage, plan])

  async function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsGenerating(true)

    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    })
    const payload = await response.json()
    const nextPlan = normalizeLoadedPlan(payload.plan as LearningPlan)
    const firstLesson = nextPlan.lessons[0] || null
    const nextTopic = buildChatTopic(nextPlan)

    setPlan(nextPlan)
    setSavedPlans((current) => upsertSavedPlan(current, nextPlan))
    setSelectedLessonId(firstLesson?.id || null)
    setActiveVideoLessonId(firstLesson?.id || null)
    clearVideoStateForPlan(nextPlan)
    setVideoError('')
    setActiveScheduleWeek(firstLesson?.week || 1)
    setScheduleEvents(buildInitialSchedule(nextPlan.lessons, nextPlan.profile.learningTimePreference))
    setActiveChatTopicId(nextTopic.id)
    setActiveChatLessonId(firstLesson?.id || null)
    setChatTopics((current) => upsertChatTopic(current, nextTopic))
    if (firstLesson) ensureLessonChat(firstLesson)
    setView('plan')
    setIsGenerating(false)
    void suggestAndAnalyzeAllVideos(nextPlan)
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
  }

  function ensureLessonChat(lesson: Lesson) {
    setChatHistoryByLesson((current) => {
      if (current[lesson.id]) return current
      return { ...current, [lesson.id]: [buildLessonSupportMessage(lesson)] }
    })
  }

  function openChatForLesson(lesson: Lesson) {
    if (plan) {
      const topic = buildChatTopic(plan)
      setChatTopics((current) => upsertChatTopic(current, topic))
      setActiveChatTopicId(topic.id)
    }
    setActiveChatLessonId(lesson.id)
    ensureLessonChat(lesson)
    setQuestion('')
    setView('chat')
  }

  function selectChatLesson(topic: ChatTopic, lesson: Lesson) {
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(lesson.id)
    ensureLessonChat(lesson)
    setQuestion('')
  }

  async function sendTutorQuestion(rawQuestion: string) {
    const trimmed = rawQuestion.trim()
    if (!trimmed || !selectedChatTopic || !selectedChatLesson) return

    const lessonId = selectedChatLesson.id
    const currentMessages = chatHistoryByLesson[lessonId] || [buildLessonSupportMessage(selectedChatLesson)]
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const nextMessages = [...currentMessages, userMessage]
    setChatHistoryByLesson((current) => ({ ...current, [lessonId]: nextMessages }))
    setQuestion('')
    setIsAsking(true)

    try {
      const videoReferences = buildTutorVideoReferences(trimmed, selectedChatLesson, selectedChatTopic, videoAnalysisByLesson)
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, plan: plan || topicToPlan(selectedChatTopic), lesson: selectedChatLesson, history: currentMessages.slice(-6), videoReferences })
      })
      const payload = await response.json()
      setChatHistoryByLesson((current) => ({
        ...current,
        [lessonId]: [...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: payload.answer }]
      }))
    } finally {
      setIsAsking(false)
    }
  }

  function clearCurrentChat() {
    if (!selectedChatLesson) return
    setChatHistoryByLesson((current) => ({
      ...current,
      [selectedChatLesson.id]: [buildLessonSupportMessage(selectedChatLesson)]
    }))
  }

  async function askTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendTutorQuestion(question)
  }

  async function analyzeVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await analyzeVideoUrl(youtubeUrl)
  }

  async function analyzeVideoUrl(url: string, sourcePlan = plan, sourceLesson = activeVideoLesson) {
    const lesson = sourceLesson || sourcePlan?.lessons.find((item) => item.id === activeVideoLessonId) || sourcePlan?.lessons[0] || null
    if (!url.trim() || !sourcePlan || !lesson) return

    setIsAnalyzingVideo(true)
    setVideoError('')

    const response = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim(), lessons: sourcePlan.lessons, language: sourcePlan.profile.videoLanguage })
    })
    const payload = await response.json()

    if (!response.ok) {
      setVideoAnalysisByLesson((current) => omitRecordKey(current, lesson.id))
      setVideoError(payload.error || 'Không phân tích được video.')
    } else {
      setVideoAnalysisByLesson((current) => ({ ...current, [lesson.id]: payload.analysis as VideoAnalysis }))
      setVideoError('')
    }

    setIsAnalyzingVideo(false)
  }

  async function suggestAndAnalyzeVideo(sourcePlan = plan, sourceLesson = activeVideoLesson, force = false) {
    if (!sourcePlan) return
    if (!sourceLesson) return

    const autoSuggestKey = videoJobKey(sourcePlan, sourceLesson)
    if (!force && (videoAnalysisByLesson[sourceLesson.id] || autoSuggestedVideoKeysRef.current.has(autoSuggestKey))) return
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
      setVideoRecommendationByLesson((current) => omitRecordKey(current, sourceLesson.id))
      setVideoError(payload.error || 'Không gợi ý được video.')
      setIsSuggestingVideo(false)
      return
    }

    const recommendation = payload.recommendation as VideoRecommendation
    setVideoRecommendationByLesson((current) => ({ ...current, [sourceLesson.id]: recommendation }))
    setYoutubeUrlByLesson((current) => ({ ...current, [sourceLesson.id]: recommendation.url }))
    setIsSuggestingVideo(false)
    await analyzeVideoUrl(recommendation.url, sourcePlan, sourceLesson)
  }

  function playVideoAt(lessonId: string, startSeconds: number) {
    setVideoPlayerStartByLesson((current) => ({ ...current, [lessonId]: Math.max(0, Math.floor(startSeconds)) }))
  }

  async function suggestAndAnalyzeAllVideos(sourcePlan = plan) {
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
      if (videoAnalysisByLesson[lesson.id] || autoSuggestedVideoKeysRef.current.has(key)) continue
      setVideoBatchStatus(`Đang gợi ý video tuần ${lesson.week}/${sourcePlan.lessons.length}`)
      await suggestAndAnalyzeVideo(sourcePlan, lesson)
    }

    setVideoBatchStatus('')
    setIsProcessingVideoBatch(false)
  }

  async function suggestAndAnalyzeSharedVideo(sourcePlan: LearningPlan) {
    const sharedKey = `shared:${planStorageId(sourcePlan)}:${sourcePlan.profile.videoLanguage}`
    const allLessonsAlreadyHaveVideo = sourcePlan.lessons.every((lesson) => videoAnalysisByLesson[lesson.id])
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
      setVideoError(analyzePayload.error || 'Không phân tích được video tổng hợp.')
      return false
    }

    const analysis = analyzePayload.analysis as VideoAnalysis
    const nextAnalysis: Record<string, VideoAnalysis> = {}
    const nextRecommendation: Record<string, VideoRecommendation> = {}
    const nextUrls: Record<string, string> = {}

    for (const lesson of sourcePlan.lessons) {
      nextAnalysis[lesson.id] = analysis
      nextRecommendation[lesson.id] = recommendation
      nextUrls[lesson.id] = recommendation.url
      autoSuggestedVideoKeysRef.current.add(videoJobKey(sourcePlan, lesson))
    }

    setVideoAnalysisByLesson((current) => ({ ...current, ...nextAnalysis }))
    setVideoRecommendationByLesson((current) => ({ ...current, ...nextRecommendation }))
    setYoutubeUrlByLesson((current) => ({ ...current, ...nextUrls }))
    setVideoError('')
    return true
  }

  async function generateLessonQuiz() {
    if (!plan || !activeVideoLesson) return

    setIsGeneratingQuiz(true)
    setVideoError('')

    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, lesson: activeVideoLesson, matches: activeVideoMatches })
    })
    const payload = await response.json()

    if (!response.ok) {
      setVideoError(payload.error || 'Không tạo được quiz.')
    } else {
      const quiz = payload.quiz as LessonQuiz
      setQuizByLesson((current) => ({ ...current, [activeVideoLesson.id]: quiz }))
      setQuizAnswersByLesson((current) => ({ ...current, [activeVideoLesson.id]: {} }))
      setIsQuizPanelOpen(true)
      setVideoError('')
    }

    setIsGeneratingQuiz(false)
  }

  function chooseQuizAnswer(questionId: string, optionIndex: number) {
    if (!activeVideoLesson) return
    setQuizAnswersByLesson((current) => ({
      ...current,
      [activeVideoLesson.id]: {
        ...(current[activeVideoLesson.id] || {}),
        [questionId]: optionIndex
      }
    }))
  }

  function addLessonToSchedule(lesson: Lesson) {
    const start = preferredScheduleStart[plan?.profile.learningTimePreference || profile.learningTimePreference]
    setScheduleEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        lessonId: lesson.id,
        week: lesson.week,
        title: lesson.title,
        day: 'Thứ 2',
        start,
        end: addMinutesToTime(start, Math.min(120, lesson.durationMinutes)),
        kind: 'study'
      }
    ])
    setActiveScheduleWeek(lesson.week)
  }

  function moveScheduleEvent(eventId: string, day: string, start: string) {
    setScheduleEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event
        const lesson = plan?.lessons.find((item) => item.id === event.lessonId)
        const duration = event.kind === 'study' ? Math.min(120, lesson?.durationMinutes || 60) : event.kind === 'practice' ? 60 : 30
        return { ...event, week: activeScheduleWeek, day, start, end: addMinutesToTime(start, duration) }
      })
    )
  }

  function removeScheduleEvent(eventId: string) {
    setScheduleEvents((current) => current.filter((event) => event.id !== eventId))
  }

  function handleDropSchedule(event: DragEvent<HTMLDivElement>, day: string, start: string) {
    event.preventDefault()
    const eventId = event.dataTransfer.getData('schedule-event-id')
    const lessonId = event.dataTransfer.getData('lesson-id')

    if (eventId) {
      moveScheduleEvent(eventId, day, start)
      return
    }

    const lesson = plan?.lessons.find((item) => item.id === lessonId)
    if (!lesson) return
    setScheduleEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        lessonId: lesson.id,
        week: activeScheduleWeek,
        title: lesson.title,
        day,
        start,
        end: addMinutesToTime(start, Math.min(120, lesson.durationMinutes)),
        kind: 'study'
      }
    ])
  }

  function applySavedTopic(topic: ChatTopic) {
    setProfile(topic.profile)
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(topic.lessons[0]?.id || null)
  }

  function clearVideoStateForPlan(nextPlan: LearningPlan) {
    const lessonIds = new Set(nextPlan.lessons.map((lesson) => lesson.id))
    setYoutubeUrlByLesson((current) => filterRecordByKeys(current, lessonIds, false))
    setVideoAnalysisByLesson((current) => filterRecordByKeys(current, lessonIds, false))
    setVideoRecommendationByLesson((current) => filterRecordByKeys(current, lessonIds, false))
    setQuizByLesson((current) => filterRecordByKeys(current, lessonIds, false))
    setQuizAnswersByLesson((current) => filterRecordByKeys(current, lessonIds, false))
  }

  function deleteSavedPlan(savedPlan: LearningPlan) {
    const savedPlanId = planStorageId(savedPlan)
    setSavedPlans((current) => current.filter((item) => planStorageId(item) !== savedPlanId))

    if (!plan || planStorageId(plan) !== savedPlanId) return
    clearVideoStateForPlan(plan)
    setPlan(null)
    setSelectedLessonId(null)
    setActiveVideoLessonId(null)
    setScheduleEvents([])
    setActiveScheduleWeek(1)
  }

  function applySavedPlan(savedPlan: LearningPlan) {
    const restoredPlan = normalizeLoadedPlan(savedPlan)
    const firstLesson = restoredPlan.lessons[0] || null
    const topic = buildChatTopic(restoredPlan)

    setProfile(restoredPlan.profile)
    setPlan(restoredPlan)
    setSelectedLessonId(firstLesson?.id || null)
    setActiveVideoLessonId(firstLesson?.id || null)
    clearVideoStateForPlan(restoredPlan)
    setVideoError('')
    setActiveScheduleWeek(firstLesson?.week || 1)
    setScheduleEvents(buildInitialSchedule(restoredPlan.lessons, restoredPlan.profile.learningTimePreference))
    setChatTopics((current) => upsertChatTopic(current, topic))
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(firstLesson?.id || null)
    if (firstLesson) ensureLessonChat(firstLesson)
    void suggestAndAnalyzeAllVideos(restoredPlan)
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">LearnMate Demo</p>
          <h1>Lộ trình học cá nhân hóa và AI tutor</h1>
        </div>
        <div className="top-actions">
          <div className="view-switch">
            <button className={view === 'plan' ? 'active' : ''} type="button" onClick={() => setView('plan')}>
              Lộ trình
            </button>
            <button className={view === 'schedule' ? 'active' : ''} type="button" onClick={() => setView('schedule')}>
              Lịch học
            </button>
            <button className={view === 'videos' ? 'active' : ''} type="button" onClick={() => setView('videos')}>
              Video
            </button>
            <button className={view === 'chat' ? 'active' : ''} type="button" onClick={() => setView('chat')}>
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

            <label>
              Chủ đề
              <div className="topic-combobox">
                <input value={profile.topic} onChange={(event) => setProfile({ ...profile, topic: event.target.value })} />
                {savedTopicOptions.length > 0 && (
                  <div className="topic-suggestions">
                    {savedTopicOptions.map((topic) => (
                      <button key={topic.id} type="button" onClick={() => applySavedTopic(topic)}>
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
                  max={30}
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

            <button className="primary-button" type="submit" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="spin" size={18} /> : <CalendarDays size={18} />}
              Tạo lộ trình học
            </button>

            {savedPlans.length > 0 && (
              <div className="saved-plan-list">
                <strong>Lộ trình đã lưu</strong>
                {savedPlans.map((savedPlan) => (
                  <div className="saved-plan-row" key={planStorageId(savedPlan)}>
                    <button className="saved-plan-open" type="button" onClick={() => applySavedPlan(savedPlan)}>
                      <span>{savedPlan.profile.topic}</span>
                      <small>{savedPlan.profile.durationWeeks} tuần · {savedPlan.profile.videoLanguage === 'en' ? 'English' : 'Tiếng Việt'}</small>
                    </button>
                    <button className="saved-plan-delete" type="button" onClick={() => deleteSavedPlan(savedPlan)} aria-label="Xóa lộ trình">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>

          <section className="plan-column">
            <div className="panel plan-summary">
              <div>
                <div className="panel-heading">
                  <BookOpen size={18} />
                  <h2>{plan?.title || 'Lộ trình học'}</h2>
                </div>
                <p>{plan?.summary || 'Nhập hồ sơ học viên rồi tạo kế hoạch cá nhân hóa.'}</p>
                {plan && (
                  <div className="foundation-box">
                    <div>
                      <strong>Kiến thức nền tảng cần có</strong>
                      <span>Bạn chọn {plan.profile.durationWeeks} tuần / gợi ý {plan.recommendedWeeks} tuần</span>
                    </div>
                    <p>{plan.durationAdvice}</p>
                    <ul>
                      {plan.prerequisites.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="progress-box">
                <span>{progress}%</span>
                <div className="progress-track">
                  <div style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <div className="lessons">
              {plan ? (
                plan.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    className={`lesson-card ${selectedLesson?.id === lesson.id ? 'active' : ''}`}
                    onClick={() => selectLesson(lesson.id)}
                    type="button"
                  >
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
                  </button>
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
                <div className="detail-title">
                  <strong>{selectedLesson.title}</strong>
                  <select value={selectedLesson.status} onChange={(event) => updateLessonStatus(selectedLesson.id, event.target.value as LessonStatus)}>
                    <option value="todo">Chưa học</option>
                    <option value="doing">Đang học</option>
                    <option value="done">Hoàn thành</option>
                    <option value="review">Cần ôn</option>
                  </select>
                </div>
                <p>{selectedLesson.checkpoint}</p>
                <ul>
                  {selectedLesson.activities.map((activity) => (
                    <li key={activity}>{activity}</li>
                  ))}
                </ul>
                <div className="quiz-list">
                  <strong>Quiz nhanh</strong>
                  {selectedLesson.quiz.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <div className="learning-assets">
                  <AssetList icon={<FileQuestion size={15} />} title="Bài tập về nhà" items={selectedLesson.homework} />
                  <AssetList icon={<Link size={15} />} title="Tài liệu học tập" items={selectedLesson.recommendedResources?.length ? selectedLesson.recommendedResources : selectedLesson.resources} />
                </div>
                <button className="complete-button" type="button" onClick={() => updateLessonStatus(selectedLesson.id, 'done')}>
                  <CheckCircle2 size={16} />
                  Đánh dấu hoàn thành
                </button>
                <button className="secondary-button" type="button" onClick={() => openChatForLesson(selectedLesson)}>
                  <MessageSquareText size={16} />
                  Chuyển sang hỏi đáp
                </button>
              </div>
            ) : (
              <div className="empty-state compact">Chọn hoặc tạo một bài học để xem gợi ý.</div>
            )}
          </aside>
        </section>
      ) : view === 'schedule' ? (
        <section className="schedule-workspace">
          <aside className="panel schedule-sidebar">
            <div className="panel-heading">
              <CalendarDays size={18} />
              <h2>Bài học có thể xếp lịch</h2>
            </div>
            {plan && (
              <div className="week-picker compact">
                {plan.lessons.map((lesson) => (
                  <button className={activeScheduleWeek === lesson.week ? 'active' : ''} key={lesson.id} type="button" onClick={() => setActiveScheduleWeek(lesson.week)}>
                    Tuần {lesson.week}
                  </button>
                ))}
              </div>
            )}
            {plan ? (
              plan.lessons.map((lesson) => (
                <div
                  className={`draggable-lesson ${activeScheduleWeek === lesson.week ? 'active' : ''}`}
                  draggable
                  key={lesson.id}
                  onDragStart={(event) => event.dataTransfer.setData('lesson-id', lesson.id)}
                >
                  <GripVertical size={16} />
                  <div>
                    <strong>Tuần {lesson.week}: {lesson.title}</strong>
                    <span>{lesson.durationMinutes} phút · {pacingLabel(lesson.pacing)}</span>
                  </div>
                  <button type="button" onClick={() => addLessonToSchedule(lesson)}>
                    <CalendarDays size={15} />
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state compact">Tạo lộ trình trước để tự sinh lịch học.</div>
            )}
          </aside>

          <section className="panel schedule-board">
            <div className="schedule-header">
              <div>
                <p className="eyebrow">Kéo thả lịch học</p>
                <h2>Lịch học tuần {activeScheduleWeek}</h2>
                <p>{plan?.lessons.find((lesson) => lesson.week === activeScheduleWeek)?.title || 'Chọn tuần để xem nội dung học tương ứng.'}</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={!plan}
                onClick={() => plan && setScheduleEvents(buildInitialSchedule(plan.lessons, plan.profile.learningTimePreference))}
              >
                Tự xếp lại
              </button>
            </div>
            {plan && (
              <div className="week-tabs">
                {plan.lessons.map((lesson) => (
                  <button className={activeScheduleWeek === lesson.week ? 'active' : ''} key={lesson.id} type="button" onClick={() => setActiveScheduleWeek(lesson.week)}>
                    Tuần {lesson.week}
                  </button>
                ))}
              </div>
            )}
            <div className="calendar-grid">
              <div className="calendar-corner" />
              {scheduleDays.map((day) => (
                <div className="calendar-day-head" key={day}>{day}</div>
              ))}
              {scheduleSlots.map((slot) => (
                <Fragment key={slot}>
                  <div className="calendar-time" key={`${slot}-time`}>{slot}</div>
                  {scheduleDays.map((day) => {
                    const events = visibleScheduleEvents.filter((item) => item.day === day && item.start === slot)
                    return (
                      <div
                        className="calendar-cell"
                        key={`${day}-${slot}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDropSchedule(event, day, slot)}
                      >
                        {events.map((item) => (
                          <div className={`schedule-event ${item.kind}`} draggable key={item.id} onDragStart={(event) => event.dataTransfer.setData('schedule-event-id', item.id)}>
                            <strong>{item.title}</strong>
                            <span>{item.start} - {item.end}</span>
                            <button type="button" onClick={() => removeScheduleEvent(item.id)} aria-label="Xóa lịch">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </section>
        </section>
      ) : view === 'videos' ? (
        <section className="video-workspace">
          <aside className="panel video-sidebar">
            <div className="panel-heading">
              <PlaySquare size={18} />
              <h2>Video theo bài</h2>
            </div>
            {plan ? (
              plan.lessons.map((lesson) => (
                <button
                  className={activeVideoLesson?.id === lesson.id ? 'active' : ''}
                  key={lesson.id}
                  type="button"
                  onClick={() => setActiveVideoLessonId(lesson.id)}
                >
                  <strong>Tuần {lesson.week}</strong>
                  <span>{lesson.title}</span>
                </button>
              ))
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
                  <button className="secondary-button" type="button" onClick={() => openChatForLesson(activeVideoLesson)}>
                    Hỏi tutor
                  </button>
                </div>

                <div className="video-study-grid">
                  <div className="video-study-content">
                <form className="video-url-form" onSubmit={analyzeVideo}>
                  <input
                    value={youtubeUrl}
                    onChange={(event) => activeVideoLesson && setYoutubeUrlByLesson((current) => ({ ...current, [activeVideoLesson.id]: event.target.value }))}
                    placeholder="YouTube URL sẽ được LLM gợi ý, hoặc bạn có thể dán tay..."
                  />
                  <button className="primary-button" type="submit" disabled={!plan || !youtubeUrl.trim() || isAnalyzingVideo}>
                    {isAnalyzingVideo ? <Loader2 className="spin" size={18} /> : <PlaySquare size={18} />}
                    Phân tích
                  </button>
                </form>

                <button className="secondary-button video-suggest-button" type="button" disabled={!plan || isSuggestingVideo || isAnalyzingVideo} onClick={() => suggestAndAnalyzeVideo()}>
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

                  <aside className={`quiz-panel ${isQuizPanelOpen ? 'expanded' : ''}`}>
                  <div className="quiz-header">
                    <div>
                      <p className="eyebrow">Quiz kiểm tra nhanh</p>
                      <strong>Tự tạo câu hỏi cho tuần {activeVideoLesson.week}</strong>
                      <span>{activeQuiz ? `${activeQuiz.questions.length} câu, mỗi câu 4 đáp án.` : 'Mở rộng để tạo và làm quiz.'}</span>
                    </div>
                    <div className="quiz-actions">
                      <button className="secondary-button" type="button" onClick={() => setIsQuizPanelOpen((current) => !current)}>
                        {isQuizPanelOpen ? 'Thu gọn' : 'Mở rộng'}
                      </button>
                      <button className="secondary-button" type="button" disabled={!plan || isGeneratingQuiz} onClick={generateLessonQuiz}>
                        {isGeneratingQuiz ? <Loader2 className="spin" size={18} /> : <FileQuestion size={18} />}
                        {activeQuiz ? 'Tạo lại quiz' : 'Tạo quiz'}
                      </button>
                    </div>
                  </div>

                  {isQuizPanelOpen && activeQuiz ? (
                    <div className="quiz-list">
                      {activeQuizResult && (
                        <div className="quiz-result-card">
                          <div>
                            <span>Điểm quiz</span>
                            <strong>{activeQuizResult.scorePercent}%</strong>
                            <small>
                              {activeQuizResult.correctCount}/{activeQuizResult.totalQuestions} câu đúng, đã trả lời {activeQuizResult.answeredCount}/{activeQuizResult.totalQuestions} câu.
                            </small>
                          </div>
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
                            <p>Bạn đã trả lời đúng tất cả câu hỏi của quiz này.</p>
                          ) : (
                            <p>Trả lời hết quiz để xem tổng hợp lỗi sai và phần cần ôn lại.</p>
                          )}
                        </div>
                      )}
                      {activeQuiz.questions.map((quizQuestion, questionIndex) => {
                        const selectedIndex = activeQuizAnswers[quizQuestion.id]
                        const hasAnswered = typeof selectedIndex === 'number'
                        const isCorrect = hasAnswered && selectedIndex === quizQuestion.correctIndex

                        return (
                          <div className="quiz-question" key={quizQuestion.id}>
                            <div className="quiz-question-title">
                              <span>Câu {questionIndex + 1}</span>
                              <strong>{quizQuestion.question}</strong>
                            </div>
                            <div className="quiz-options">
                              {quizQuestion.options.map((option, optionIndex) => {
                                const isSelected = selectedIndex === optionIndex
                                const isAnswer = hasAnswered && quizQuestion.correctIndex === optionIndex
                                const optionClass = [
                                  isSelected ? 'selected' : '',
                                  isAnswer ? 'correct' : '',
                                  hasAnswered && isSelected && !isCorrect ? 'wrong' : ''
                                ]
                                  .filter(Boolean)
                                  .join(' ')

                                return (
                                  <button className={optionClass} key={`${quizQuestion.id}-${optionIndex}`} type="button" onClick={() => chooseQuizAnswer(quizQuestion.id, optionIndex)}>
                                    <b>{String.fromCharCode(65 + optionIndex)}</b>
                                    <span>{option}</span>
                                  </button>
                                )
                              })}
                            </div>
                            {hasAnswered && (
                              <p className={isCorrect ? 'quiz-feedback correct' : 'quiz-feedback wrong'}>
                                {isCorrect ? 'Đúng rồi.' : `Chưa đúng. Đáp án đúng là ${String.fromCharCode(65 + quizQuestion.correctIndex)}.`} {quizQuestion.explanation}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : isQuizPanelOpen ? (
                    <p className="quiz-empty">Tạo quiz sau khi xem video hoặc ngay khi chọn bài học. Nếu đã có timestamp, quiz sẽ ưu tiên nội dung trong các đoạn video phù hợp.</p>
                  ) : (
                    <p className="quiz-empty">Quiz đang ở góc phải. Mở rộng khi bạn muốn tự kiểm tra.</p>
                  )}
                  </aside>
                </div>
              </>
            ) : (
              <div className="empty-state">Chọn một bài học để xem video gợi ý.</div>
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
              chatTopics.map((topic) => (
                <div className="chat-topic-group" key={topic.id}>
                  <button
                    className={`topic-button ${activeChatTopicId === topic.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setActiveChatTopicId(topic.id)
                      setActiveChatLessonId(topic.lessons[0]?.id || null)
                      if (topic.lessons[0]) ensureLessonChat(topic.lessons[0])
                    }}
                  >
                    <strong>{topic.topic}</strong>
                    <span>{topic.lessons.length} bài học</span>
                  </button>
                  <div className="chat-lesson-list">
                    {topic.lessons.map((lesson) => {
                      const count = (chatHistoryByLesson[lesson.id] || []).filter((message) => !isLessonSupportMessage(message)).length
                      return (
                        <button
                          className={activeChatLessonId === lesson.id ? 'active' : ''}
                          key={lesson.id}
                          type="button"
                          onClick={() => selectChatLesson(topic, lesson)}
                        >
                          <span>Tuần {lesson.week}: {lesson.title}</span>
                          <small>{count} tin</small>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
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
                  <button type="button" disabled={isAsking} onClick={() => sendTutorQuestion(`Giải thích dễ hiểu hơn bài "${selectedChatLesson.title}"`)}>
                    Giải thích
                  </button>
                  <button type="button" disabled={isAsking} onClick={() => sendTutorQuestion(`Cho tôi một ví dụ thực hành cho bài "${selectedChatLesson.title}"`)}>
                    Ví dụ
                  </button>
                  <button type="button" disabled={isAsking} onClick={() => sendTutorQuestion(`Kiểm tra tôi bằng 3 câu hỏi ngắn về bài "${selectedChatLesson.title}"`)}>
                    Kiểm tra
                  </button>
                  <button type="button" disabled={isAsking} onClick={() => sendTutorQuestion(`Tôi nên xem lại phút nào, đoạn nào trong video cho bài "${selectedChatLesson.title}"?`)}>
                    Timestamp
                  </button>
                </div>

                <div className="chat-history-heading">
                  <div>
                    <h3>Lịch sử đoạn chat</h3>
                    <p>{selectedChatTopic?.topic} / {selectedChatLesson.title}</p>
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
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi tutor về bài học này..." />
                  <button type="submit" disabled={!selectedChatLesson || isAsking}>
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
    </main>
  )
}

function buildChatTopic(plan: LearningPlan): ChatTopic {
  return {
    id: stableTopicId(plan.profile),
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

function legacyLessonMap<T>(plan: LearningPlan | null, value: T | null | undefined): Record<string, T> {
  const firstLessonId = plan?.lessons[0]?.id
  if (!firstLessonId || value === null || value === undefined || value === '') return {}
  return { [firstLessonId]: value as T }
}

function planStorageId(plan: LearningPlan) {
  return slugify(`${plan.profile.topic}-${plan.profile.goal}-${plan.profile.durationWeeks}-${plan.profile.videoLanguage}`)
}

function videoJobKey(plan: LearningPlan, lesson: Lesson) {
  return `${planStorageId(plan)}:${lesson.id}:${plan.profile.videoLanguage}`
}

function normalizeLoadedPlan(plan: LearningPlan): LearningPlan {
  const profile = normalizeLoadedProfile(plan.profile)
  return {
    ...plan,
    profile,
    lessons: normalizeLessonList(plan.lessons || [], profile)
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

function buildInitialSchedule(lessons: Lesson[], preference: LearnerProfile['learningTimePreference'] = 'evening'): ScheduleEvent[] {
  const start = preferredScheduleStart[preference]
  const practiceStart = start === '19:00' ? '19:00' : start
  const reviewStart = start === '07:00' ? '12:00' : start

  return lessons.flatMap((lesson) => {
    const mainMinutes = Math.min(120, Math.max(60, Math.round(lesson.durationMinutes * 0.45)))
    const practiceMinutes = Math.min(90, Math.max(45, Math.round(lesson.durationMinutes * 0.3)))

    return [
      {
        id: `study-${lesson.id}`,
        lessonId: lesson.id,
        week: lesson.week,
        title: lesson.title,
        day: 'Thứ 2',
        start,
        end: addMinutesToTime(start, mainMinutes),
        kind: 'study' as const
      },
      {
        id: `practice-${lesson.id}`,
        lessonId: lesson.id,
        week: lesson.week,
        title: `Thực hành: ${lesson.title}`,
        day: 'Thứ 4',
        start: practiceStart,
        end: addMinutesToTime(practiceStart, practiceMinutes),
        kind: 'practice' as const
      },
      {
        id: `review-${lesson.id}`,
        lessonId: lesson.id,
        week: lesson.week,
        title: `Ôn + quiz: ${lesson.title}`,
        day: 'Thứ 6',
        start: reviewStart,
        end: addMinutesToTime(reviewStart, 30),
        kind: 'review' as const
      }
    ]
  })
}

function addMinutesToTime(value: string, minutes: number) {
  const [hour, minute] = value.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const nextHour = Math.floor(total / 60) % 24
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
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

function buildTutorVideoReferences(
  question: string,
  lesson: Lesson,
  topic: ChatTopic,
  analysisByLesson: Record<string, VideoAnalysis>
) {
  const analysis = analysisByLesson[lesson.id]
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
    const url = firstString(record.url, record.link, record.href)
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
