import type { Ref } from "react";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type MediaBlockType = "file" | "image" | "video" | "audio";

export type NoteEditorHandle = {
  setParagraph: () => void;
  cycleHeading: () => void;
  setBulletList: () => void;
  setNumberedList: () => void;
  setToggleList: () => void;
  insertMedia: (type: MediaBlockType) => void;
  indent: () => void;
  outdent: () => void;
  undo: () => void;
  redo: () => void;
};

export type NoteEditorProps = {
  ref?: Ref<NoteEditorHandle>;
  documentId: string;
  contentJson: string | null;
  contentMarkdown: string | null;
  editable: boolean;
  onHeadingLevelChange: (level: HeadingLevel | null) => void;
  onDraft: (contentJson: string) => Promise<void>;
  onSave: (contentJson: string) => Promise<void>;
};
