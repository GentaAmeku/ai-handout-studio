import {
  BookOpen,
  ChartColumn,
  CircleCheck,
  Clock,
  FileText,
  Flag,
  Lightbulb,
  type LucideIcon,
  MessageCircle,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { type IconName, isIconName } from "../schema/icons";

// アイコンは単色の線画を少数だけ。名前の一覧はスキーマ側が持つ
const icons: Readonly<Record<IconName, LucideIcon>> = {
  target: Target,
  "trending-up": TrendingUp,
  "book-open": BookOpen,
  settings: Settings,
  "circle-check": CircleCheck,
  lightbulb: Lightbulb,
  users: Users,
  "chart-column": ChartColumn,
  flag: Flag,
  clock: Clock,
  "shield-check": ShieldCheck,
  rocket: Rocket,
  "message-circle": MessageCircle,
  "file-text": FileText,
  search: Search,
  wrench: Wrench,
  sparkles: Sparkles,
};

export const BlockIcon = ({ name, size }: { name?: string; size: number }) => {
  const Icon = name && isIconName(name) ? icons[name] : undefined;
  return Icon ? (
    <Icon className="ds-icon" size={size} strokeWidth={1.75} aria-hidden />
  ) : null;
};
