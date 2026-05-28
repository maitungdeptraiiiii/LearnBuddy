'use client'

import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, Clock, Loader2, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react'
import type { ChatMessage, LearnerProfile, LearningPlan, LessonStatus } from '@/lib/types'

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

export default function Home() {
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile)
  const [plan, setPlan] = useState<LearningPlan | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAsking, setIsAsking] = useState(false)

  const selectedLesson = useMemo(
    () => plan?.lessons.find((lesson) => lesson.id === selectedLessonId) || plan?.lessons[0] || null,
    [plan, selectedLessonId]
  )

  const progress = useMemo(() => {
    if (!plan) return 0
    const done = plan.lessons.filter((lesson) => lesson.status === 'done').length
    return Math.round((done / plan.lessons.length) * 100)
  }, [plan])

  async function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsGenerating(true)
    setMessages([])

    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    })
    const payload = await response.json()
    setPlan(payload.plan)
    setSelectedLessonId(payload.plan.lessons[0]?.id || null)
    setIsGenerating(false)
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

  async function askTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || !plan) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setQuestion('')
    setIsAsking(true)

    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: trimmed, plan, lesson: selectedLesson, history: messages.slice(-6) })
    })
    const payload = await response.json()
    setMessages([...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: payload.answer }])
    setIsAsking(false)
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">LearnMate Demo</p>
          <h1>Lộ trình học cá nhân hóa và AI tutor</h1>
        </div>
        <div className="paper-note">MVP bám sát luồng: profile → plan → tutor → progress</div>
      </section>

      <section className="workspace">
        <form className="panel profile-panel" onSubmit={generatePlan}>
          <div className="panel-heading">
            <Sparkles size={18} />
            <h2>Hồ sơ học viên</h2>
          </div>

          <label>
            Chủ đề
            <input value={profile.topic} onChange={(event) => setProfile({ ...profile, topic: event.target.value })} />
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
                  onClick={() => setSelectedLessonId(lesson.id)}
                  type="button"
                >
                  <div className="lesson-head">
                    <span>Tuần {lesson.week}</span>
                    <small>{statusLabel[lesson.status]}</small>
                  </div>
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
            <h2>AI tutor</h2>
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
            </div>
          ) : (
            <div className="empty-state compact">Chọn hoặc tạo một bài học để tutor có ngữ cảnh.</div>
          )}

          <div className="chat-log">
            {messages.length === 0 ? (
              <div className="empty-state compact">Hỏi tutor về bài học đang chọn.</div>
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
            <button type="submit" disabled={!plan || isAsking}>
              <CheckCircle2 size={18} />
            </button>
          </form>

          <button className="secondary-button" type="button" onClick={() => setMessages([])}>
            <RotateCcw size={16} />
            Xóa chat
          </button>
        </aside>
      </section>
    </main>
  )
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
