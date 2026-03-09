export class SyllabusFileDto {
    id: number;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number | null;
    uploadedAt: Date;
}
