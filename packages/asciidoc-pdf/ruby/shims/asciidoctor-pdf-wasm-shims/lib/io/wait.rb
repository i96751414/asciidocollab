# Inert `io/wait` stand-in for the offline WASI sandbox. The native io/wait extension is absent from
# the wasm Ruby build; net/protocol requires it at load time. These no-op IO methods satisfy that
# require. They are only ever referenced against real sockets, which never exist offline, so returning
# nil / false is safe here.
class IO
  def wait(*)          = nil
  def wait_readable(*) = nil
  def wait_writable(*) = nil
  def ready?           = false
end
