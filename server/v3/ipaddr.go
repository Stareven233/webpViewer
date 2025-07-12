package main

import (
	"fmt"
	"net"
	"strings"
)

func getLocalIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}

	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		// 检查是否为IP地址且不是回环地址
		if !ok || ipNet.IP.IsLoopback() {
			return "", err
		}
		// 检查是否为IPv4地址
		ip := ipNet.IP.String()
		if ipNet.IP.To4() != nil && strings.HasPrefix(ip, "192.168") {
			return ip, nil
		}
	}

	return "", fmt.Errorf("no local IP address found")
}

func getLocalIPs() ([]string, error) {
	var ips []string
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil, err
	}

	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				ips = append(ips, ipNet.IP.String())
			}
		}
	}

	if len(ips) == 0 {
		return nil, fmt.Errorf("no local IP address found")
	}
	return ips, nil
}
