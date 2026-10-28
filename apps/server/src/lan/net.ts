import { isIPv4 } from 'node:net';
import os from 'node:os';

/** Reads this PC's network interfaces (tests inject a fake). */
export type InterfacesProvider = () => NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** Host names that always mean "this PC". */
export const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);

/** Lowercase host name of a Host header, without the port (IPv6 keeps its brackets). */
export function hostnameOf(hostHeader: string | undefined): string {
  const host = (hostHeader ?? '').trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(':');
  // a bare IPv6 address has several colons and no port
  if (colon === -1 || colon !== host.lastIndexOf(':')) return host;
  return host.slice(0, colon);
}

/** True for 127.0.0.0/8, ::1 and IPv4-mapped loopback (::ffff:127.x.x.x). */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  if (a === '::1' || a === '0:0:0:0:0:0:0:1') return true;
  const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
  return isIPv4(v4) && v4.startsWith('127.');
}

/** True when HOST listens on every interface (0.0.0.0 or ::). */
export function isWildcardHost(host: string): boolean {
  return WILDCARD_HOSTS.has(host.trim().toLowerCase());
}

/** True when HOST only accepts this PC (localhost or a loopback address). */
export function isLoopbackHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return h === 'localhost' || isLoopbackAddress(h);
}

/** Sort key of a LAN IPv4 for the pairing URL: home routers first, then corporate ranges. */
export function addressRank(ip: string): number {
  const [a, b] = ip.split('.').map(Number);
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return 2;
  // link-local (no DHCP answer): almost never what the phone sees
  if (a === 169 && b === 254) return 4;
  return 3;
}

// Adapters a phone usually cannot reach: virtual machines, containers, VPNs.
const VIRTUAL_IFACE =
  /virtual|vethernet|hyper-?v|vmware|vmnet|vbox|\bwsl|docker|^br-|^veth|virbr|tailscale|zerotier|^zt|hamachi|radmin|vpn|wireguard|^wg\d|\b(?:tap|tun|utun)\d*\b|bluetooth|npcap|loopback/i;

export type LanAddress = { address: string; iface: string; virtual: boolean };

/** Non-internal IPv4 addresses of this PC, the best one for a phone first. */
export function lanAddresses(read: InterfacesProvider = os.networkInterfaces): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [iface, infos] of Object.entries(read())) {
    for (const info of infos ?? []) {
      if (info.internal || !isIPv4(info.address)) continue;
      if (found.some((f) => f.address === info.address)) continue;
      found.push({ address: info.address, iface, virtual: VIRTUAL_IFACE.test(iface) });
    }
  }
  // stable sort: real adapters first, then 192.168 > 10 > 172.16-31 > others
  return found.sort((x, y) => Number(x.virtual) - Number(y.virtual) || addressRank(x.address) - addressRank(y.address));
}

/** Host part of a URL: IPv6 addresses go in brackets. */
export function urlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/** Deck URL that pairs a phone in one scan. */
export function pairingUrl(host: string, port: number, code: string): string {
  return `http://${urlHost(host)}:${port}/dock/?pair=${encodeURIComponent(code)}`;
}
