"use client";

export type ModelOption = {
  key: string;
  name: string;
  provider: string;
  tags: string[];
};

export function ModelPicker(_props: {
  models: ModelOption[];
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return null;
}
