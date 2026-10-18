import { stdin, stdout } from "node:process";
import { ProvisioningError, requireProvisioning } from "./accounts";

export async function identityPasswordInput(email?: string) {
  let password = "";
  try {
    password = await terminalInput(email ? `Unique password for ${email}` : "Shared development password for all nine accounts", true);
    return { password, confirmation: await terminalInput("Confirm password", true) };
  } finally { password = ""; }
}

// No readline history, command arguments, files or environment variables carry secrets.
// Raw input also prevents a pasted multiline secret from being echoed by the TTY.
export function terminalInput(label: string, secret = false): Promise<string> {
  requireProvisioning(stdin.isTTY && stdout.isTTY && typeof stdin.setRawMode === "function", "LOCAL_INTERACTIVE_TERMINAL_REQUIRED");
  return new Promise((resolve, reject) => {
    let value = "", settled = false;
    const previousRaw = stdin.isRaw;
    const finish = (error?: ProvisioningError) => {
      if (settled) return;
      settled = true;
      stdin.off("data", onData);
      stdin.off("error", onError);
      process.off("SIGTERM", onInterrupt);
      process.off("SIGHUP", onInterrupt);
      process.off("SIGINT", onInterrupt);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stdout.write("\n");
      const result = value;
      value = "";
      if (error) reject(error); else resolve(result);
    };
    const onInterrupt = () => finish(new ProvisioningError("OPERATOR_CANCELLED"));
    const onError = () => finish(new ProvisioningError("TERMINAL_INPUT_FAILED"));
    const onData = (data: Buffer) => {
      const text = data.toString("utf8");
      // Reject pasted multiline input rather than accidentally accepting one line as confirmation.
      if ((text.match(/[\r\n]/g)?.length ?? 0) > 1 || /[\r\n].+/.test(text)) {
        finish(new ProvisioningError("MULTILINE_INPUT_REJECTED")); return;
      }
      for (const character of text) {
        if (character === "\u0003" || character === "\u0004" || character === "\u001a") { onInterrupt(); return; }
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u007f" || character === "\b") {
          if (value.length) { value = Array.from(value).slice(0, -1).join(""); stdout.write("\b \b"); }
        } else if (/[\x00-\x1f\x7f]/.test(character)) {
          finish(new ProvisioningError("CONTROL_CHARACTER_REJECTED")); return;
        } else {
          value += character;
          if (value.length > 8192) { finish(new ProvisioningError("INPUT_TOO_LONG")); return; }
          stdout.write(secret ? "*" : character);
        }
      }
    };
    stdin.setRawMode(true);
    stdin.on("data", onData);
    stdin.once("error", onError);
    process.once("SIGTERM", onInterrupt);
    process.once("SIGHUP", onInterrupt);
    process.once("SIGINT", onInterrupt);
    stdin.resume();
    stdout.write(`${label}: `);
  });
}
