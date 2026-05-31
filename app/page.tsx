'use client'

import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, Clock, Loader2, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react'
import type { ChatMessage, LearnerProfile, LearningPlan, Lesson, LessonStatus } from '@/lib/types'

const initialProfile: LearnerProfile = {
  topic: 'Python cơ bản',
  goal: 'Làm được một project nhỏ sau khóa học',
  level: 'beginner',
  durationWeeks: 4,
  hoursPerWeek: 5,
  pace: 'normal',
  learningStyle: 'mixed'
}

const statusLabel: Record<LessonStatus, string> = {
  todo: 'Chưa học',
  doing: 'Đang học',
  done: 'Hoàn thành',
  review: 'Cần ôn'
}

type AppView = 'plan' | 'chat'
type ChatHistoryByLesson = Record<string, ChatMessage[]>
type ChatTopic = {
  id: string
  topic: string
  goal: string
  title: string
  profile: LearnerProfile
  lessons: Lesson[]
}

export default function Home() {
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile)
  const [plan, setPlan] = useState<LearningPlan | null>(null)
  const [view, setView] = useState<AppView>('plan')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [activeChatTopicId, setActiveChatTopicId] = useState<string | null>(null)
  const [activeChatLessonId, setActiveChatLessonId] = useState<string | null>(null)
  const [chatTopics, setChatTopics] = useState<ChatTopic[]>([])
  const [chatHistoryByLesson, setChatHistoryByLesson] = useState<ChatHistoryByLesson>({})
  const [question, setQuestion] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAsking, setIsAsking] = useState(false)

  const selectedLesson = useMemo(
    () => plan?.lessons.find((lesson) => lesson.id === selectedLessonId) || plan?.lessons[0] || null,
    [plan, selectedLessonId]
  )

  const selectedChatTopic = useMemo(() => chatTopics.find((topic) => topic.id === activeChatTopicId) || null, [chatTopics, activeChatTopicId])
  const selectedChatLesson = useMemo(
    () => selectedChatTopic?.lessons.find((lesson) => lesson.id === activeChatLessonId) || selectedChatTopic?.lessons[0] || null,
    [selectedChatTopic, activeChatLessonId]
  )
  const messages = selectedChatLesson ? chatHistoryByLesson[selectedChatLesson.id] || [] : []
  const chatMessageCount = messages.filter((message) => !isLessonSupportMessage(message)).length
  const savedTopicOptions = chatTopics
    .filter((topic) => {
      const query = profile.topic.trim().toLowerCase()
      return query.length > 0 && topic.topic.toLowerCase().includes(query)
    })
    .slice(0, 4)

  const progress = useMemo(() => {
    if (!plan) return 0
    const done = plan.lessons.filter((lesson) => lesson.status === 'done').length
    return Math.round((done / plan.lessons.length) * 100)
  }, [plan])

  async function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsGenerating(true)

    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    })
    const payload = await response.json()
    const nextPlan = payload.plan as LearningPlan
    const firstLesson = nextPlan.lessons[0] || null
    const nextTopic = buildChatTopic(nextPlan)

    setPlan(nextPlan)
    setSelectedLessonId(firstLesson?.id || null)
    setActiveChatTopicId(nextTopic.id)
    setActiveChatLessonId(firstLesson?.id || null)
    setChatTopics((current) => upsertChatTopic(current, nextTopic))
    if (firstLesson) ensureLessonChat(firstLesson)
    setView('plan')
    setIsGenerating(false)
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
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, plan: plan || topicToPlan(selectedChatTopic), lesson: selectedChatLesson, history: currentMessages.slice(-6) })
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

  function applySavedTopic(topic: ChatTopic) {
    setProfile(topic.profile)
    setActiveChatTopicId(topic.id)
    setActiveChatLessonId(topic.lessons[0]?.id || null)
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
            <button className={view === 'chat' ? 'active' : ''} type="button" onClick={() => setView('chat')}>
              Hỏi đáp
            </button>
          </div>
          <div className="paper-note">MVP bám sát luồng: profile → plan → tutor → progress</div>
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

            <button className="primary-button" type="submit" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="spin" size={18} /> : <CalendarDays size={18} />}
              Tạo lộ trình học
            </button>
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
                </div>

                <div className="chat-history-heading">
                  <div>
                    <h3>Lịch sử đoạn chat</h3>
                    <p>{selectedChatTopic?.topic} / {selectedChatLesson.title}</p>
                  </div>
                  <span>{chatMessageCount} tin nhắn</span>
                </div>

                <div className="chat-log full">
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
    recommendedWeeks: topic.lessons.length,
    durationAdvice: '',
    profile: topic.profile,
    lessons: topic.lessons
  }
}

function stableTopicId(profile: LearnerProfile) {
  return slugify(`${profile.topic}-${profile.goal}`)
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
  const lines = content.replace(/\r\n/g, '\n').split('\n')
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

    if (trimmed.startsWith('### ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', content: trimmed.replace(/^#+\s*/, '') })
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      list.push(trimmed.replace(/^[-*]\s+/, ''))
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  if (code.length) blocks.push({ type: 'code', content: code.join('\n') })

  return blocks
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }

    return part
  })
}
