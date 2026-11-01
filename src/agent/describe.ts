/** Turns tool traffic into something a human reads faster than JSON. */

type Input = Record<string, unknown> | undefined;

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const fmt = (value: number): string => (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1));

export function describeTool(name: string, input: Input): string {
  switch (name) {
    case 'observe':
      return '观察四周';
    case 'walk': {
      const distance = num(input?.distance);
      return distance >= 0 ? `前进 ${fmt(distance)} 格` : `后退 ${fmt(-distance)} 格`;
    }
    case 'turn': {
      const degrees = num(input?.degrees);
      return degrees >= 0 ? `右转 ${fmt(degrees)}°` : `左转 ${fmt(-degrees)}°`;
    }
    case 'turn_to':
      return `转向方位 ${fmt(num(input?.heading))}°`;
    case 'move_to':
      return `移动到 (${fmt(num(input?.x))}, ${fmt(num(input?.z))})`;
    case 'approach':
      return `走向 ${String(input?.id ?? '目标')}`;
    case 'interact':
      return input?.id ? `交互 ${String(input.id)}` : '交互最近的物体';
    case 'set_height':
      return `升降到 ${fmt(num(input?.level))}`;
    case 'drive':
      return `驱动 ${fmt(num(input?.seconds))} 秒`;
    case 'wait':
      return `等待 ${fmt(num(input?.seconds))} 秒`;
    case 'plant_apple':
      return `在 (${fmt(num(input?.x))}, ${fmt(num(input?.z))}) 种下苹果`;
    default:
      return name;
  }
}

export function describeResult(output: unknown): string {
  const payload = extractPayload(output);
  if (!payload) return '完成';
  if (payload.ok === false) return `未完成 · ${String(payload.reason ?? '未知原因')}`;
  if (typeof payload.action === 'string' && typeof payload.target === 'string') {
    return payload.action === 'eat' ? `吃掉了 ${payload.target}` : `与 ${payload.target} 互动`;
  }
  if (typeof payload.achieved === 'number') {
    const target = typeof payload.target === 'number' ? ` / 目标 ${fmt(payload.target)}` : '';
    return `到位 · 实际 ${fmt(payload.achieved)}${target}`;
  }
  return '完成';
}

/** MCP tool results arrive as { content: [{ type: 'text', text: '<json>' }] }. */
function extractPayload(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object') return null;
  const content = (output as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
      const text = String((part as { text?: unknown }).text ?? '');
      try {
        const parsed: unknown = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
