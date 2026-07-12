# Local, pure-Ruby shim gem baked into the wasm engine.
#
# The rendering closure transitively requires net/http (prawn-svg -> css_parser -> net/http), which in
# turn requires the native stdlib extensions `socket` and `io/wait`. Those are BSD-socket features
# that do not exist in the WASI sandbox and are not part of the wasm Ruby build, so the require chain
# would fail and asciidoctor-pdf could not even load. The engine runs fully offline (no network, no
# remote CSS/resources), so net/http is never actually exercised — these files simply satisfy the
# load-time `require` with inert stand-ins. They must never perform real I/O.
Gem::Specification.new do |s|
  s.name        = "asciidoctor-pdf-wasm-shims"
  s.version     = "0.0.0"
  s.summary     = "Inert offline stdlib shims (socket, io/wait) for the WASI sandbox"
  s.authors     = ["asciidocollab"]
  s.files       = ["lib/socket.rb", "lib/io/wait.rb"]
  s.require_paths = ["lib"]
end
