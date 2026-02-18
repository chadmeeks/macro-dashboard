const { execSync, spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);

function killExistingProcessOnPort(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();

    if (!output) return;

    const pids = [...new Set(output.split(/\s+/).filter(Boolean))];
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch (_) {}
    }

    // Small delay for shutdown before hard kill.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 0);
        process.kill(Number(pid), "SIGKILL");
      } catch (_) {}
    }

    console.log(`Cleared existing process(es) on port ${port}: ${pids.join(", ")}`);
  } catch (_) {
    // No process on port or lsof unavailable.
  }
}

killExistingProcessOnPort(PORT);

const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", code => process.exit(code ?? 0));
child.on("error", err => {
  console.error("Failed to start dashboard:", err.message);
  process.exit(1);
});
