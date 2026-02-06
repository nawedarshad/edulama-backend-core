
export class CreateLessonDto {
    syllabusId: number;
    title: string;
    description?: string;
    content?: any; // Rich JSON content
    durationMinutes?: number;
    thumbnail?: string;
}

export class CreateQuizDto {
    title: string;
    description?: string;
    validUntil?: Date;
    questions: {
        text: string;
        type: string;
        points: number;
        options: {
            text: string;
            isCorrect: boolean;
        }[];
    }[];
}
