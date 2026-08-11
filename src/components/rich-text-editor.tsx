"use client"; // contentEditable + document.execCommand only work client-side

import { useEffect, useRef } from "react";
import { BoldIcon, ItalicIcon, ListIcon } from "@/components/shell/icons";

const TOOLBAR_ACTIONS = [
  { command: "bold", icon: BoldIcon, label: "Negrita" },
  { command: "italic", icon: ItalicIcon, label: "Cursiva" },
  { command: "insertUnorderedList", icon: ListIcon, label: "Lista con viñetas" },
] as const;

// Minimal contentEditable-based rich text editor (bold/italic/bullet list)
// via document.execCommand — no editor library dependency, matching this
// codebase's "avoid unnecessary dependencies" rule (see CLAUDE.md) for the
// small formatting surface these forms actually need.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[120px]",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder: string;
  minHeightClassName?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Only re-syncs the DOM when `value` changes from outside (e.g. a reset)
  // — typing already updates the DOM directly via onInput, so mirroring on
  // every keystroke would fight the browser's own caret position.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const runCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {TOOLBAR_ACTIONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(command)}
            aria-label={label}
            className="flex size-7 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        suppressContentEditableWarning
        className={`${minHeightClassName} overflow-y-auto px-3 py-2.5 text-sm focus:outline-none empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]`}
      />
    </div>
  );
}
