import { useEffect, useState } from "react";
import type * as monaco from "monaco-editor";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Contenu non fiable : HTML nettoyé, images distantes bloquées (confidentialité), liens désactivés.
DOMPurify.addHook("afterSanitizeAttributes", (n) => {
  if (n.tagName === "IMG") { const src = n.getAttribute("src") ?? ""; if (!src.startsWith("data:")) { n.removeAttribute("src"); n.setAttribute("alt", n.getAttribute("alt") || "image bloquée"); } }
});
export function MdPreview({ model }: { model: monaco.editor.ITextModel }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let t: number | undefined;
    const render = () => setHtml(DOMPurify.sanitize(marked.parse(model.getValue(), { async: false }) as string));
    render();
    const d = model.onDidChangeContent(() => { window.clearTimeout(t); t = window.setTimeout(render, 200); });
    return () => { d.dispose(); window.clearTimeout(t); };
  }, [model]);
  return <div className="md" aria-label="Aperçu Markdown" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }} dangerouslySetInnerHTML={{ __html: html }} />;
}
