import {
  Camera,
  CircleHelp,
  Code,
  FileCode2,
  Image,
  Info,
  LayoutGrid,
  List,
  ListOrdered,
  type LucideIcon,
  Quote,
  StickyNote,
  Table,
  Text,
  TriangleAlert,
} from "lucide-react";
import type { DocumentBlockType } from "../../schema/document";

// 部品の印。パーツパネルと左の並びで同じ形を使う
export const documentPartIcons: { [T in DocumentBlockType]: LucideIcon } = {
  text: Text,
  bullets: List,
  ordered: ListOrdered,
  table: Table,
  cards: LayoutGrid,
  notice: Info,
  note: StickyNote,
  alert: TriangleAlert,
  open: CircleHelp,
  quote: Quote,
  code: Code,
  figure: Image,
  image: Camera,
  html: FileCode2,
};
