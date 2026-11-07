package main

import (
	"fmt"
	"net"
	"strings"
)

// 虚拟网卡名称关键字：这类网卡（Hyper-V / WSL / Docker / 虚拟机 / VPN）常排在物理网卡之前，
// 会抢占“第一个 IP”，但它们的地址并非路由器分配的局域网地址
var virtualIfaceKeywords = []string{
	"vethernet", "hyper-v", "vmware", "virtualbox", "vmnet", "docker",
	"wsl", "loopback", "tailscale", "zerotier", "tap", "tun", "vpn", "virtual",
}

// isVirtualIface 判断网卡名是否命中虚拟网卡关键字
func isVirtualIface(name string) bool {
	n := strings.ToLower(name)
	for _, kw := range virtualIfaceKeywords {
		if strings.Contains(n, kw) {
			return true
		}
	}
	return false
}

// usableIPv4 判断是否为可用于局域网访问的 IPv4（排除回环、169.254 链路本地、组播、非私有地址）
func usableIPv4(ip net.IP) bool {
	return ip.To4() != nil && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() &&
		!ip.IsMulticast() && !ip.IsUnspecified() && ip.IsPrivate()
}

// collectLocalIPs 遍历已启用且非虚拟的网卡，收集可用的私有 IPv4
func collectLocalIPs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}

	var ips []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 || isVirtualIface(iface.Name) {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || !usableIPv4(ipNet.IP) {
				continue
			}
			ips = append(ips, ipNet.IP.String())
		}
	}
	return ips
}

// interfaceNameOf 反查 IP 所属网卡名称（用于校验出口网卡是否虚拟）
func interfaceNameOf(ip net.IP) string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && ipNet.IP.Equal(ip) {
				return iface.Name
			}
		}
	}
	return ""
}

// outboundIP 通过 UDP "connect" 让内核做一次选路探测（不实际发包），
// 返回的本地地址就是带默认网关的出口网卡地址，最接近路由器分配的真实局域网 IP
func outboundIP() string {
	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()

	udpAddr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok || !usableIPv4(udpAddr.IP) {
		return ""
	}
	// 出口网卡若是虚拟/VPN 网卡则放弃，避免拿到非局域网地址
	if isVirtualIface(interfaceNameOf(udpAddr.IP)) {
		return ""
	}
	return udpAddr.IP.String()
}

// getLocalIP 优先返回内核选路得到的出口地址，失败再回退到网卡枚举的第一个可用地址
func getLocalIP() (string, error) {
	if ip := outboundIP(); ip != "" {
		return ip, nil
	}
	if ips := collectLocalIPs(); len(ips) > 0 {
		return ips[0], nil
	}
	return "", fmt.Errorf("no local IP address found")
}

// getLocalIPs 返回全部可用的局域网 IPv4（已排除虚拟网卡与回环地址）
func getLocalIPs() ([]string, error) {
	ips := collectLocalIPs()
	if len(ips) == 0 {
		return nil, fmt.Errorf("no local IP address found")
	}
	return ips, nil
}
