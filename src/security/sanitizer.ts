import type { SecurityFinding } from "../domain/types.js";

interface PatternRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  severity: SecurityFinding["severity"];
  description: string;
}

const secretRules: PatternRule[] = [
  {
    name: "bearer_token",
    pattern: /Bearer\s+[A-Za-z0-9._~+\/-]{16,}/gi,
    replacement: "Bearer [REDACTED]",
    severity: "critical",
    description: "Possible bearer token"
  },
  {
    name: "github_token",
    pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
    severity: "critical",
    description: "Possible GitHub access token"
  },
  {
    name: "supabase_token",
    pattern: /\bsbp_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_SUPABASE_TOKEN]",
    severity: "critical",
    description: "Possible Supabase personal access token"
  },
  {
    name: "secret_assignment",
    pattern: /\b(?:password|passwd|api[_-]?key|secret|access[_-]?token|database[_-]?url)\s*[:=]\s*["']?[^\s"']{8,}["']?/gi,
    replacement: "[REDACTED_SECRET_ASSIGNMENT]",
    severity: "critical",
    description: "Possible credential or secret assignment"
  },
  {
    name: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
    severity: "critical",
    description: "Private key material"
  },
  {
    name: "sensitive_url_query",
    pattern: /https?:\/\/[^\s]+[?&](?:token|key|secret|signature|sig|auth)=[^\s&]+/gi,
    replacement: "[REDACTED_SENSITIVE_URL]",
    severity: "high",
    description: "URL containing a sensitive query parameter"
  }
];

const promptInjectionSignals = [
  /ignore (?:all |any )?(?:previous|prior) instructions/i,
  /bypass (?:the )?(?:security|approval|safety)/i,
  /system prompt/i,
  /do not tell (?:the )?user/i
];

export interface SanitizationResult {
  content: string;
  findings: SecurityFinding[];
  changed: boolean;
  promptInjectionDetected: boolean;
}

export function sanitizeUntrustedText(input: string): SanitizationResult {
  let content = input;
  const findings: SecurityFinding[] = [];

  for (const rule of secretRules) {
    const matches = content.match(rule.pattern);
    if (matches?.length) {
      findings.push({
        type: rule.name,
        severity: rule.severity,
        description: `${rule.description} (${matches.length} match${matches.length === 1 ? "" : "es"})`
      });
      content = content.replace(rule.pattern, rule.replacement);
    }
  }

  const promptInjectionDetected = promptInjectionSignals.some((pattern) => pattern.test(input));
  if (promptInjectionDetected) {
    findings.push({
      type: "prompt_injection_signal",
      severity: "high",
      description: "Captured text contains instructions that must be treated as untrusted data"
    });
  }

  return {
    content,
    findings,
    changed: content !== input,
    promptInjectionDetected
  };
}
