export class PdfLayoutValidationError extends Error {
  code: string;
  statusCode: number;
}

export function validateDeclaredPdfLayout(input: {
  declaredVersion: unknown;
  pdfBuffer?: Buffer;
}): Promise<string | null>;
