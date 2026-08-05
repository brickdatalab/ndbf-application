import type jsPDF from "jspdf";
import type { PdfLayoutContract } from "./pdf-layout-contract.js";

export function addUnderwritingSourcePage(
  document: jsPDF,
  layout: PdfLayoutContract,
): void;

export function drawUnderwritingSourcePage(
  document: jsPDF,
  layout: PdfLayoutContract,
): void;

export function drawSourcePdfFooter(
  document: jsPDF,
  pageNumber: number,
  pageTotal: number,
): void;
