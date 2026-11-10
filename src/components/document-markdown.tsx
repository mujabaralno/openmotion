"use client";

import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const DocumentMarkdown = memo(function DocumentMarkdown({
  content,
  fileName,
}: {
  content: string;
  fileName: string;
}) {
  return (
    <article className="markdown-preview" aria-label={`Preview ${fileName}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ children, href, title }) {
            const external = /^https?:\/\//i.test(href ?? "");
            return (
              <a
                href={href}
                title={title}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="markdown-table-scroll">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </article>
  );
});
