// Clean download file names (section 8), e.g. AWLEL_Vol25_Issue1_Okeke_2025.pdf.

/** ASCII-only, file-name-safe form of a surname: "Ọkafọ" -> "Okafo". */
export function fileNamePart(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9-]+/g, "")
      .slice(0, 40) || "Article"
  );
}
