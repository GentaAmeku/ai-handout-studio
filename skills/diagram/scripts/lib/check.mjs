// 図の JSON の検査。種類ごとに書ける項目と、箱・つながり・まとまり(レーン・段階・囲み)の形を確かめる。
// 書き間違いを黙って無視すると、効かない項目や読めない図に気づけないので、知らない項目も落とす。
import { CHANGES, ROLES } from "./style.mjs";

export const MAX_NODES = 12;

// まとまりの名前と、すべての箱がどれか1つに入る必要があるか(囲みは外に置く箱があってよい)
const GROUPS = {
  lanes: { name: "レーン", every: true },
  phases: { name: "段階", every: true },
  boundaries: { name: "囲み", every: false },
};
// 種類ごとに書ける項目。比較の前と後(before・after)は、題と説明を持たない
const BODY = {
  flow: ["type", "nodes", "edges", "lanes", "phases", "direction"],
  structure: ["type", "nodes", "edges", "boundaries"],
};
const KINDS = {
  flow: [...BODY.flow, "title", "caption"],
  structure: [...BODY.structure, "title", "caption"],
  compare: ["type", "title", "caption", "before", "after"],
};
const NODE_KEYS = ["id", "label", "sub", "role", "change"];
const EDGE_KEYS = ["from", "to", "label", "change"];
const CHANGE_NAMES = Object.keys(CHANGES).filter((k) => k !== "same");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

export function checkSpec(spec, problems) {
  if (!isObject(spec)) return problems.push("図の JSON は、オブジェクトで書いてください");
  if (!Object.hasOwn(KINDS, spec.type)) return problems.push(`type は ${Object.keys(KINDS).join(" / ")} のどれかにしてください`);
  const push = (message) => problems.push(message);
  unknownKeys(spec, KINDS[spec.type], "図の", push);
  if (!isText(spec.title)) push("title(何の図か)が要ります");
  if (!isText(spec.caption)) push("caption(何を示す図か、1〜2文)が要ります");
  if (spec.type !== "compare") return checkBody(spec, push);

  for (const side of ["before", "after"]) {
    const sub = spec[side];
    const sidePush = (message) => problems.push(`${side}: ${message}`);
    if (!isObject(sub)) sidePush("流れか構成の図を書いてください");
    else if (!Object.hasOwn(BODY, sub.type)) sidePush("type は flow か structure にしてください");
    else {
      unknownKeys(sub, BODY[sub.type], "", sidePush);
      checkBody(sub, sidePush);
    }
  }
  if (Object.hasOwn(BODY, spec.before?.type) && Object.hasOwn(BODY, spec.after?.type) && spec.before.type !== spec.after.type)
    push("before と after は同じ種類の図にしてください");
}

function checkBody(spec, push) {
  if (!Array.isArray(spec.nodes) || !spec.nodes.length) return push("nodes(箱の配列)が要ります");
  if (spec.nodes.length > MAX_NODES) push(`箱が${spec.nodes.length}個あります。${MAX_NODES}個までにして、超えるなら図を分けてください`);
  const ids = new Set();
  for (const node of spec.nodes) {
    if (!isObject(node)) {
      push("箱は、オブジェクトで書いてください");
      continue;
    }
    unknownKeys(node, NODE_KEYS, `箱「${node.id}」の`, push);
    if (!isText(node.id) || !isText(node.label)) push("箱には id と label(文字)が要ります");
    if (node.sub !== undefined && typeof node.sub !== "string") push(`箱「${node.id}」の sub は文字で書いてください`);
    if (node.role !== undefined && !Object.hasOwn(ROLES, node.role))
      push(`箱「${node.id}」の role「${node.role}」は ${Object.keys(ROLES).join(" / ")} のどれかにしてください`);
    if (node.change !== undefined && !CHANGE_NAMES.includes(node.change))
      push(`箱「${node.id}」の change「${node.change}」は ${CHANGE_NAMES.join(" / ")} のどれかにしてください`);
    if (ids.has(node.id)) push(`id「${node.id}」が重複しています`);
    ids.add(node.id);
  }

  if (spec.edges !== undefined && !Array.isArray(spec.edges)) push("edges(つながり)は配列で書いてください");
  for (const edge of Array.isArray(spec.edges) ? spec.edges : []) {
    if (!isObject(edge)) {
      push("つながりは、オブジェクトで書いてください");
      continue;
    }
    const name = `つながり「${edge.from} → ${edge.to}」の`;
    unknownKeys(edge, EDGE_KEYS, name, push);
    for (const end of [edge.from, edge.to]) if (!ids.has(end)) push(`矢印の先「${end}」がありません`);
    if (edge.from === edge.to) push(`箱「${edge.from}」から自分への矢印は描けません`);
    if (edge.label !== undefined && typeof edge.label !== "string") push(`${name} label は文字で書いてください`);
    if (edge.change !== undefined && !CHANGE_NAMES.includes(edge.change))
      push(`${name} change「${edge.change}」は ${CHANGE_NAMES.join(" / ")} のどれかにしてください`);
  }

  if (spec.direction !== undefined && spec.direction !== "down") push("direction は、縦にするときだけ \"down\" と書いてください");
  for (const [key, { name, every }] of Object.entries(GROUPS)) if (spec[key] !== undefined) checkGroups(spec[key], name, every, ids, push);
}

function checkGroups(groups, name, every, ids, push) {
  if (!Array.isArray(groups)) return push(`${name}は配列で書いてください`);
  const count = new Map();
  for (const group of groups) {
    if (!isObject(group)) {
      push(`${name}は、オブジェクトで書いてください`);
      continue;
    }
    unknownKeys(group, ["label", "nodes"], `${name}「${group.label}」の`, push);
    if (!isText(group.label)) push(`${name}には label が要ります`);
    if (!Array.isArray(group.nodes) || !group.nodes.length) {
      push(`${name}「${group.label}」に箱がありません`);
      continue;
    }
    for (const id of group.nodes) {
      if (!ids.has(id)) push(`${name}「${group.label}」の箱「${id}」がありません`);
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  for (const id of ids) {
    const n = count.get(id) ?? 0;
    if (every ? n !== 1 : n > 1) push(`箱「${id}」は、どれか1つの${name}にだけ入れてください`);
  }
}

function unknownKeys(value, allowed, at, push) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) push(`${at}「${key}」は書けません(書けるのは ${allowed.join("・")})`);
}
