#!/usr/bin/env node
// Hook PostToolUse: deja el archivo sin lineas en blanco, salvo las que viven dentro de un
// template literal o de un comentario de bloque (ahi son contenido, no separacion visual).
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Indices (0-based) de las lineas cuyo inicio cae dentro de un template literal o de un
 * comentario de bloque. Escaner de un paso; los literales de regex no se tratan de forma
 * especial (basta para este proyecto).
 */
function protectedLines(src) {
  const prot = new Set();
  const stack = []; // "tpl" (texto del literal) | "expr" (${...}) | "brace" ({ dentro de expr)
  let state = "code"; // code | sq | dq | line | block
  let line = 0;
  const top = () => stack[stack.length - 1];
  const inTpl = () => top() === "tpl";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "\n") {
      if (state === "line" || state === "sq" || state === "dq") state = "code";
      line++;
      if (state === "block" || inTpl()) prot.add(line);
      continue;
    }
    switch (state) {
      case "sq":
      case "dq":
        if (c === "\\") i++;
        else if (c === (state === "sq" ? "'" : '"')) state = "code";
        break;
      case "line":
        break; // se cierra en el salto de linea
      case "block":
        if (c === "*" && n === "/") {
          state = "code";
          i++;
        }
        break;
      default:
        if (inTpl()) {
          if (c === "\\") i++;
          else if (c === "`") stack.pop();
          else if (c === "$" && n === "{") {
            stack.push("expr");
            i++;
          }
        } else if (c === "/" && n === "/") {
          state = "line";
          i++;
        } else if (c === "/" && n === "*") {
          state = "block";
          i++;
        } else if (c === "'") state = "sq";
        else if (c === '"') state = "dq";
        else if (c === "`") stack.push("tpl");
        else if (c === "{" && top() === "expr") stack.push("brace");
        else if (c === "}" && (top() === "brace" || top() === "expr")) stack.pop();
    }
  }
  return prot;
}

const file = process.argv[2];
if (!file) process.exit(0);
try {
  const src = readFileSync(file, "utf8");
  const prot = protectedLines(src);
  const lines = src.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out = lines.filter((l, i) => prot.has(i) || l.trim() !== "");
  const result = out.length ? out.join("\n") + "\n" : "";
  if (result !== src) writeFileSync(file, result);
} catch {
  process.exit(0);
}
