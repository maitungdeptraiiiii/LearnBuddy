import type { LearnerProfile, LearningPlan, Lesson } from '@/lib/types'

const paceMultiplier = {
  gentle: 0.8,
  normal: 1,
  intensive: 1.25
}

export function generateFallbackPlan(profile: LearnerProfile): LearningPlan {
  const lessonsPerWeek = Math.max(2, Math.min(5, Math.round(profile.hoursPerWeek / 1.5)))
  const totalLessons = Math.max(4, profile.durationWeeks * lessonsPerWeek)
  const minutes = Math.max(35, Math.round((profile.hoursPerWeek * 60 * paceMultiplier[profile.pace]) / lessonsPerWeek))

  const lessonTemplates = [
    ['Bản đồ kiến thức nền tảng', 'Nắm các khái niệm cốt lõi và phạm vi cần học'],
    ['Khái niệm trọng tâm', 'Hiểu các thuật ngữ và nguyên lý chính'],
    ['Ví dụ có hướng dẫn', 'Áp dụng kiến thức vào ví dụ ngắn'],
    ['Thực hành có phản hồi', 'Làm bài tập và tự phát hiện lỗ hổng'],
    ['Tình huống tổng hợp', 'Kết nối nhiều ý thành một cách giải'],
    ['Ôn tập và kiểm tra', 'Củng cố phần đã học bằng quiz ngắn']
  ]

  const lessons: Lesson[] = Array.from({ length: totalLessons }, (_, index) => {
    const week = Math.floor(index / lessonsPerWeek) + 1
    const template = lessonTemplates[index % lessonTemplates.length]
    return {
      id: `lesson-${index + 1}`,
      week,
      title: `${template[0]}: ${profile.topic}`,
      objective: template[1],
      durationMinutes: minutes,
      activities: buildActivities(profile.learningStyle, profile.topic),
      checkpoint: `Giải thích được ${template[1].toLowerCase()} trong chủ đề ${profile.topic}.`,
      quiz: [
        `Điểm quan trọng nhất của buổi học này là gì?`,
        `Hãy nêu một ví dụ thực tế liên quan đến ${profile.topic}.`,
        `Phần nào bạn còn thấy mơ hồ và cần tutor giải thích lại?`
      ],
      status: 'todo'
    }
  })

  return {
    title: `Lộ trình học ${profile.topic}`,
    summary: `Kế hoạch ${profile.durationWeeks} tuần để đạt mục tiêu: ${profile.goal}. Lộ trình ưu tiên tốc độ ${profile.pace}, trình độ ${profile.level}, phong cách ${profile.learningStyle}.`,
    profile,
    lessons
  }
}

function buildActivities(style: LearnerProfile['learningStyle'], topic: string): string[] {
  const base = [`Đọc phần tóm tắt về ${topic}`, 'Ghi lại 3 ý chính', 'Hỏi tutor một câu chưa rõ']
  if (style === 'practice') return [...base, 'Làm bài tập ngắn', 'So sánh đáp án với checkpoint']
  if (style === 'project') return [...base, 'Áp dụng vào một mini project', 'Ghi lại quyết định thiết kế']
  if (style === 'concepts') return [...base, 'Vẽ sơ đồ khái niệm', 'Tự giải thích lại bằng ngôn ngữ đơn giản']
  return [...base, 'Làm ví dụ thực hành', 'Tự kiểm tra bằng quiz']
}
