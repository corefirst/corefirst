import { describe, it, expect } from 'vitest';
import {
  reduceCourseGenEvent,
  initialCourseGenProgress,
} from '@/components/CourseGenProgress';

describe('reduceCourseGenEvent', () => {
  it('initialises chapters from the outline event', () => {
    const next = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [
        { lessonIndex: 0, title: 'A' },
        { lessonIndex: 1, title: 'B' },
      ],
    });
    expect(next.lessons).toHaveLength(2);
    expect(next.lessons[0]).toMatchObject({
      lessonIndex: 0,
      title: 'A',
      textStatus: 'generating',
      imageStatus: 'waiting',
      audioStatus: 'waiting',
    });
  });

  it('flips a chapter to done on lesson-text done', () => {
    const seeded = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [{ lessonIndex: 0, title: 'A' }],
    });
    const next = reduceCourseGenEvent(seeded, {
      type: 'lesson-text',
      lessonIndex: 0,
      status: 'done',
    });
    expect(next.lessons[0].textStatus).toBe('done');
  });

  it('records INSUFFICIENT_CREDITS when a lesson-image fails with that code', () => {
    const seeded = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [{ lessonIndex: 0, title: 'A' }],
    });
    const next = reduceCourseGenEvent(seeded, {
      type: 'lesson-image',
      lessonIndex: 0,
      status: 'failed',
      code: 'INSUFFICIENT_CREDITS',
    });
    expect(next.errorCode).toBe('INSUFFICIENT_CREDITS');
    expect(next.lessons[0].imageStatus).toBe('failed');
  });

  it('keeps audio status at failed once any script in the lesson fails', () => {
    const seeded = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [{ lessonIndex: 0, title: 'A' }],
    });
    const failed = reduceCourseGenEvent(seeded, {
      type: 'lesson-audio',
      lessonIndex: 0,
      scriptIndex: 0,
      status: 'failed',
    });
    const followUp = reduceCourseGenEvent(failed, {
      type: 'lesson-audio',
      lessonIndex: 0,
      scriptIndex: 1,
      status: 'done',
    });
    expect(followUp.lessons[0].audioStatus).toBe('failed');
  });

  it('promotes a chapter audio to generating while any script is running', () => {
    const seeded = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [{ lessonIndex: 0, title: 'A' }],
    });
    const next = reduceCourseGenEvent(seeded, {
      type: 'lesson-audio',
      lessonIndex: 0,
      scriptIndex: 0,
      status: 'generating',
    });
    expect(next.lessons[0].audioStatus).toBe('generating');
  });

  it('records error events with code + message', () => {
    const next = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'error',
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits.',
    });
    expect(next.errorCode).toBe('INSUFFICIENT_CREDITS');
    expect(next.errorMessage).toBe('Insufficient credits.');
  });

  it('flags creditsExhausted on the complete event', () => {
    const next = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'complete',
      creditsExhausted: true,
    });
    expect(next.errorCode).toBe('INSUFFICIENT_CREDITS');
    expect(next.step).toBeNull();
  });

  it('ignores unknown event types without mutating state', () => {
    const seeded = reduceCourseGenEvent(initialCourseGenProgress, {
      type: 'outline',
      lessons: [{ lessonIndex: 0, title: 'A' }],
    });
    const next = reduceCourseGenEvent(seeded, { type: 'mystery' });
    expect(next).toBe(seeded);
  });
});
