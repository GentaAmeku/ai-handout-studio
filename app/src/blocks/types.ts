import type { ReactNode } from "react";
import type { RenderContext } from "../renderer/context";
import type { BlockOf, KnownBlockType } from "../schema/block";

export type BlockProps<T extends KnownBlockType> = {
  block: BlockOf<T>;
  context: RenderContext;
};

export type BlockComponent<T extends KnownBlockType> = (
  props: BlockProps<T>,
) => ReactNode;
