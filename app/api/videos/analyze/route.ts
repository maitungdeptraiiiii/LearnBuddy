import { NextResponse } from 'next/server'
import { analyzeYoutubeVideo } from '@/lib/video-index'
import type { Lesson, VideoLanguage } from '@/lib/types'

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string; lessons?: Lesson[]; language?: VideoLanguage }
  const url = body.url?.trim()

  if (!url) {
    return NextResponse.json({ error: 'Thiếu YouTube URL.' }, { status: 400 })
  }

  try {
    const analysis = await analyzeYoutubeVideo(url, body.lessons || [], body.language || 'vi')
    return NextResponse.json({ analysis })
  } catch (error) {
    return NextResponse.json({ error: friendlyVideoError(error, 'Không phân tích được video.') }, { status: 400 })
  }
}

function friendlyVideoError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (/video is not available|this video is not available/i.test(message)) {
    return 'Video này hiện không khả dụng hoặc không lấy được dữ liệu từ YouTube. Hãy thử video khác.'
  }
  return message ? message.split('\n')[0].slice(0, 220) : fallback
}
