/**
 * Fixture data for the browser IPC shim. Lets the full UI — grid, list,
 * discovery, editor, settings — be exercised under `npm run dev` without
 * compiling the Rust side. Mirrors the real bootstrap payload shape.
 *
 * Dev only: nothing here ships. See tauri-shim.ts.
 */
import type {
  BootstrapData,
  DiscoveryCandidate,
  Group,
  LaunchItem,
  LaunchItemKind,
  Settings,
} from "./types";

let order = 0;

function item(
  partial: Partial<LaunchItem> & { name: string; kind: LaunchItemKind; target: string },
): LaunchItem {
  order += 1;
  return {
    id: `fixture-${order}`,
    command: null,
    note: null,
    fixedArgs: null,
    runtimeArgs: null,
    workingDir: null,
    keepOpen: false,
    runAsAdmin: false,
    isFavorite: false,
    launchCount: 0,
    lastLaunchedAt: null,
    groupId: null,
    iconSource: "auto",
    iconPath: null,
    sortOrder: order,
    createdAt: "2026-04-01T09:00:00Z",
    updatedAt: "2026-04-01T09:00:00Z",
    ...partial,
  };
}

export const fixtureGroups: Group[] = [
  { id: "group-system", name: "系统", sortOrder: 0 },
  { id: "group-hkmisc", name: "hk-misc", sortOrder: 1 },
  { id: "group-proxy", name: "代理", sortOrder: 2 },
];

export const fixtureItems: LaunchItem[] = [
  item({
    name: "Burp Suite",
    kind: "link",
    target: "D:\\hk-tools\\BurpSuite V2024.2.1.2\\CNBurp-2024.2.1.2.VBS.lnk",
    note: "抓包工具",
    isFavorite: true,
    launchCount: 12,
    lastLaunchedAt: "2026-09-22T00:14:00Z",
  }),
  item({
    name: "httpx",
    kind: "command",
    target: "httpx",
    command: "cmd.exe",
    fixedArgs: "-silent -threads 50",
    runtimeArgs:
      "-u https://www.baidu.com -u:这是一个测试 -a:这是一个测试 -a:这是一个测试 -u:这是一个测试 -a:这是一个测试",
    note: "这是一个测试",
    isFavorite: true,
    launchCount: 10,
    lastLaunchedAt: "2026-09-20T11:20:00Z",
    keepOpen: true,
  }),
  item({
    name: "fofaviewer",
    kind: "command",
    target: "fofaviewer",
    command: "cmd.exe",
    fixedArgs: "C:\\D:\\hk-tools\\env\\Java\\jdk-17\\bin\\javaw.exe -jar fofaviewer.jar",
    note: "信息收集工具",
    isFavorite: true,
    launchCount: 10,
    groupId: "group-hkmisc",
  }),
  item({
    name: "nuclei",
    kind: "command",
    target: "nuclei",
    command: "cmd.exe",
    fixedArgs: "/C",
    runtimeArgs: "nuclei -a test1 -b test2",
    note: "漏洞探测",
    // A working directory is the only location a command item can point at, so
    // one fixture item carries it to keep that branch exercised.
    workingDir: "D:\\hk-tools",
    isFavorite: true,
    launchCount: 11,
    lastLaunchedAt: "2026-08-19T09:28:00Z",
  }),
  item({
    name: "interactsh-client",
    kind: "command",
    target: "interactsh-client",
    command: "cmd.exe",
    fixedArgs: "/K",
    runtimeArgs: "interactsh-client",
    note: "OOB test client for ssrf",
    launchCount: 12,
    lastLaunchedAt: "2026-09-22T23:16:00Z",
  }),
  item({
    name: "Task Manager",
    kind: "link",
    target: "C:\\Users\\Administrator\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\System Tools\\Task Manager.lnk",
    launchCount: 13,
    lastLaunchedAt: "2026-08-21T23:03:00Z",
    groupId: "group-system",
  }),
  item({
    name: "VMware Workstation",
    kind: "exe",
    target: "C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmware.exe",
    note: "test",
    launchCount: 11,
    lastLaunchedAt: "2026-08-21T22:34:00Z",
  }),
  item({
    name: "Visual Studio Code",
    kind: "link",
    target: "C:\\Users\\Administrator\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Visual Studio Code\\Visual Studio Code.lnk",
    isFavorite: true,
    launchCount: 6,
    lastLaunchedAt: "2026-09-14T08:02:00Z",
  }),
  item({
    name: "QQ",
    kind: "exe",
    target: "D:\\Program Files\\Tencent\\QQNT\\QQ.exe",
    launchCount: 3,
    lastLaunchedAt: "2026-09-02T19:41:00Z",
  }),
  item({
    name: "hk-tools",
    kind: "folder",
    target: "D:\\hk-tools",
    note: "工具目录",
    launchCount: 4,
    groupId: "group-hkmisc",
  }),
  item({
    name: "ProjectDiscovery Docs",
    kind: "url",
    target: "https://docs.projectdiscovery.io",
    groupId: "group-proxy",
  }),
  item({
    name: "一个名字特别特别长的启动项用来测试换行和截断行为",
    kind: "url",
    target: "https://example.com/a/very/long/path/that/keeps/going/and/going",
    note: "长名称与长路径的压力测试",
  }),
];

export function fixtureBootstrap(displayMode: Settings["displayMode"] = "list"): BootstrapData {
  return {
    // Copies, not the arrays themselves: the shim's mutating handlers push into
    // these, and handing the app the same reference would double-count whatever
    // the handler also returned.
    items: [...fixtureItems],
    groups: [...fixtureGroups],
    settings: {
      hotkey: "Alt+Space",
      launchOnStartup: false,
      closeOnLaunch: true,
      themeMode: "system",
      displayMode,
      windowWidth: 760,
      windowHeight: 560,
      windowX: null,
      windowY: null,
    },
    configDirectory: {
      currentPath: "C:\\Users\\Administrator\\AppData\\Roaming\\com.deskrun.desktop",
      defaultPath: "C:\\Users\\Administrator\\AppData\\Roaming\\com.deskrun.desktop",
      usingCustomPath: false,
    },
    startupWarning: null,
  };
}

const DISCOVERY_NAMES = [
  "7-Zip File Manager",
  "7-Zip Help",
  "Access",
  "Adobe Acrobat",
  "ALTRun",
  "Anaconda Prompt",
  "Application Verifier (WOW)",
  "Application Verifier (X64)",
  "BlueStacks 5",
  "Burp Suite Community Edition",
  "Charles",
  "Command Prompt",
  "Docker Desktop",
  "Fiddler Everywhere",
  "Firefox",
  "Git Bash",
  "Google Chrome",
  "HxD Hex Editor",
  "ILSpy",
  "IDA Free",
  "Java Mission Control",
  "JetBrains Rider",
  "jq",
  "kdreports",
  "MobaXterm",
  "Notepad++",
  "Obsidian",
  "OpenSSH Client",
  "Postman",
  "PowerShell 7",
  "Process Monitor",
  "Process Explorer",
  "PuTTY",
  "Python 3.12",
  "Redis Insight",
  "Regshot",
  "Sublime Text",
  "Sysinternals Autoruns",
  "TcpView",
  "Termius",
  "Visual Studio Installer",
  "Wireshark",
  "WinDbg",
  "Windows Terminal",
  "WinSCP",
  "x64dbg",
  "XnView MP",
  "Zeal",
];

export const fixtureDiscoveryCandidates: DiscoveryCandidate[] = DISCOVERY_NAMES.map(
  (name, index) => ({
    id: `candidate-${index}`,
    name,
    kind: index % 3 === 0 ? "exe" : "link",
    target: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${name}.lnk`,
    source: (["start_menu", "desktop", "registry"] as const)[index % 3],
    confidence: (["high", "high", "medium", "low"] as const)[index % 4],
    alreadyExists: index % 11 === 3,
  }),
);
