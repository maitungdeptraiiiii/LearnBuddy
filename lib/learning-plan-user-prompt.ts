import type { LearnerProfile } from '@/lib/types'

export function buildLearningPlanUserPrompt(profile: LearnerProfile) {
  const labels = describeProfileLabels(profile)

  return `
Hãy tạo lộ trình học cá nhân hóa với thông tin sau:

Chủ đề học: ${profile.topic}
Trình độ hiện tại: ${labels.level} (${profile.level})
Tốc độ học: ${labels.pace} (${profile.pace})
Số tuần học: ${profile.durationWeeks}
Số giờ học mỗi tuần: ${profile.hoursPerWeek}
Phong cách học: ${labels.learningStyle} (${profile.learningStyle})
Mục tiêu học: ${profile.goal}
Thời gian học ưu tiên: ${labels.learningTimePreference} (${profile.learningTimePreference})
Ngôn ngữ video ưu tiên: ${labels.videoLanguage} (${profile.videoLanguage})

Yêu cầu quan trọng:
- Lộ trình phải có đúng ${profile.durationWeeks} tuần.
- Nội dung phải phù hợp với trình độ ${labels.level}.
- Nếu trình độ là Advanced, không được bắt đầu bằng kiến thức nền tảng ở tuần 1.
- Nếu phong cách học là học khái niệm/lý thuyết, hãy tăng phần giải thích lý thuyết và nguyên lý.
- Nếu phong cách học là thực hành/project, hãy tăng bài tập, code, sản phẩm thực tế hoặc project nhỏ.
- Nếu tốc độ học nhanh, hãy tăng độ nén, độ khó và ưu tiên tài liệu nâng cao.
- Nếu tốc độ học chậm, hãy chia nhỏ nội dung, thêm ví dụ và phần ôn tập.
- Không được tạo nội dung chung chung.
- Không bịa tên video cụ thể; chỉ gợi ý loại tài liệu/video hoặc từ khóa tìm kiếm.
- Mỗi lesson phải khác nhau rõ ràng về title, objective, activities, homework, resources, checkpoint và quiz.

Trả về JSON theo schema hiện tại của LearnBuddy:

{
  "title": "string",
  "summary": "string",
  "prerequisites": ["string"],
  "prerequisiteGraph": [
    {
      "from": "string",
      "to": "string",
      "reason": "string"
    }
  ],
  "recommendedWeeks": number,
  "durationAdvice": "string",
  "lessons": [
    {
      "id": "lesson-1",
      "week": 1,
      "pacing": "skim | normal | deep",
      "title": "string",
      "objective": "string",
      "durationMinutes": number,
      "activities": [
        "Nội dung chính: ...",
        "Khái niệm chính: ...",
        "Hoạt động học tập: ...",
        "Thời gian phân bổ: ..."
      ],
      "homework": [
        "Bài tập hoặc project nhỏ: ..."
      ],
      "resources": [
        "Gợi ý tài liệu/video hoặc từ khóa tìm kiếm: ..."
      ],
      "recommendedResources": [
        {
          "type": "video | article | documentation | exercise | project",
          "primaryLanguage": "Vietnamese | English",
          "searchKeyword": "string",
          "englishKeywords": ["string"],
          "vietnameseKeywords": ["string"],
          "level": "Beginner | Intermediate | Advanced",
          "learningStyleFit": "string",
          "whyRecommended": "string"
        }
      ],
      "checkpoint": "string",
      "quiz": ["string"],
      "status": "todo"
    }
  ]
}

Chỉ trả về JSON hợp lệ, không thêm markdown hoặc giải thích ngoài JSON.
`.trim()
}

function describeProfileLabels(profile: LearnerProfile) {
  return {
    level: label(profile.level, {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced'
    }),
    pace: label(profile.pace, {
      gentle: 'Chậm',
      normal: 'Vừa',
      intensive: 'Nhanh'
    }),
    learningStyle: label(profile.learningStyle, {
      concepts: 'Học khái niệm / lý thuyết',
      practice: 'Thực hành',
      project: 'Học qua dự án',
      mixed: 'Kết hợp'
    }),
    learningTimePreference: label(profile.learningTimePreference, {
      morning: 'Sáng',
      noon: 'Trưa',
      afternoon: 'Chiều',
      evening: 'Tối'
    }),
    videoLanguage: label(profile.videoLanguage, {
      vi: 'Vietnamese',
      en: 'English'
    })
  }
}

function label<T extends string>(value: T, labels: Partial<Record<T, string>>) {
  return labels[value] || value
}
