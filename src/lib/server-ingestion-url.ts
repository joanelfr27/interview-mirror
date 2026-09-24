import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 203 && b === 0) || a >= 224;
}

function parseIpv6(ip: string): number[] | null {
  const value = ip.toLowerCase().split("%")[0];
  if (!value.includes(":")) return null;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return parseIpv4AsGroups(mapped[1]);
  const parts = value.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const groups = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function parseIpv4AsGroups(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return [0, 0, 0, 0, 0, 0xffff, (parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family !== 6) return true;
  const groups = parseIpv6(ip);
  if (!groups) return true;
  const mapped = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff;
  if (mapped) {
    const v4 = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
    return isPrivateIpv4(v4);
  }
  if (groups.every((value, index) => index < 7 ? value === 0 : value === 1)) return true;
  if (groups[0] === 0 && groups.slice(1).every((value) => value === 0)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  return false;
}

export async function assertPublicIngestionUrl(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("BLOCKED_PRIVATE_URL");
    return;
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, order: "verbatim" });
  } catch {
    throw new Error("DNS_RESOLUTION_FAILED");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("BLOCKED_PRIVATE_URL");
  }
}
