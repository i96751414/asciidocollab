# Inert `socket` stand-in for the offline WASI sandbox. The wasm Ruby build has no BSD sockets; the
# rendering closure only pulls this in via net/http's load chain and never opens a connection offline.
# These empty class definitions satisfy the load-time `require 'socket'` and any constant lookups; no
# method here does real I/O. If a code path ever actually tried to use a socket, that would be a bug
# (the pipeline is fully offline) — not something this shim should quietly enable.
class SocketError < StandardError; end
class BasicSocket < IO; end
class IPSocket   < BasicSocket; end
class TCPSocket  < IPSocket; end
class TCPServer  < TCPSocket; end
class UDPSocket  < IPSocket; end
class UNIXSocket < BasicSocket; end
class UNIXServer < UNIXSocket; end
class Socket     < BasicSocket
  module Constants; end
end
class Addrinfo; end
