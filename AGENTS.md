# GarMyFriend scope

The user's current WebPanel scope is exactly two physical substitutes: the
GC9A01 face display and a rotary encoder. Preserve the shared parts' appearance
and basic input. Do not add dashboards, sensor controls, servos, scenarios,
record/replay, direct expression selectors or execution controls to this scope.

Application behavior belongs in `application/`. The face application reads
GPIO and writes SPI and must operate independently of the WebPanel process.
`simulation/` and `simulator/` relay physical input and driver-produced pixels;
they must not choose expressions, animate faces or generate application output.

Reuse gar-tools through the submodule. Keep reusable hardware models there,
Product wiring and face behavior here. Follow the submodule's Web simulator
design guidance when changing the part composition.

Hardware data follows GAR's CSV headers: `hardware/components.csv` owns part
numbers, `connections.csv` owns the physical wiring plan, and `gpio.csv` /
`spi.csv` own the selected runtime I/O assignment. Do not create parallel part
or pin-plan JSON files. Keep physical header numbers distinct from Linux line
offsets. Application and virtual driver startup must read I/O values from CSV.
