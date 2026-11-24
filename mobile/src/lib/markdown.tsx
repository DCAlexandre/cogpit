/** Render Claude's markdown (bold, code, lists, links…) safely into the chat.
 *  marked → HTML, DOMPurify sanitises before it touches the DOM. */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

export function Markdown({ text }: { text: string }): JSX.Element {
  const html = DOMPurify.sanitize(marked.parse(text) as string, { ADD_ATTR: ['target'] })
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
