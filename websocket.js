const fs = require("fs");
const path = require("path");

let clientes = [];
let periodos = [];
let consumos = [];
let prorrateos = [];

let auth = { username: "admin", password: "admin" };
let defaultValues = { cliente: "", administrador: "", nit: "", telefono: "" };

// Paths para archivos de almacenamiento
const DATA_DIR = path.join(__dirname, "data");
const CLIENTES_FILE = path.join(DATA_DIR, "clientes.json");
const PERIODOS_FILE = path.join(DATA_DIR, "periodos.json");
const CONSUMOS_FILE = path.join(DATA_DIR, "consumos.json");
const GRUPOS_FILE = path.join(DATA_DIR, "grupos.json");
const PRORRATEOS_FILE = path.join(DATA_DIR, "prorrateos.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const DEFAULT_VALUES_FILE = path.join(DATA_DIR, "default_values.json");

// Utilidad para cargar JSON
function loadJson(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      return JSON.parse(raw || "null") || defaultValue;
    }
  } catch (err) {
    console.error(`Error leyendo ${file}:`, err);
  }
  return defaultValue;
}

// Utilidad para guardar JSON
function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error guardando ${file}:`, err);
  }
}

// Cargar datos al inicio
function loadData() {
  clientes = loadJson(CLIENTES_FILE, []);
  periodos = loadJson(PERIODOS_FILE, []);
  consumos = loadJson(CONSUMOS_FILE, []);
  grupos = loadJson(GRUPOS_FILE, []);
  prorrateos = loadJson(PRORRATEOS_FILE, []);
  auth = loadJson(AUTH_FILE, { username: "admin", password: "admin" });
  defaultValues = loadJson(DEFAULT_VALUES_FILE, { cliente: "", administrador: "", nit: "", telefono: "" });
}

// Guardar todos los datos
function saveAll() {
  saveJson(CLIENTES_FILE, clientes);
  saveJson(PERIODOS_FILE, periodos);
  saveJson(CONSUMOS_FILE, consumos);
  saveJson(GRUPOS_FILE, grupos);
  saveJson(PRORRATEOS_FILE, prorrateos);
  saveJson(AUTH_FILE, auth);
}

// Calcular días entre dos fechas (inclusive)
function calcularDiasFacturados(fechaInicio, fechaFin) {
  try {
    const ini = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const diffMs = fin - ini;
    if (isNaN(diffMs)) return 0;
    return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  } catch {
    return 0;
  }
}

// Recalcular consumoTotal de cada periodo
function recalcularConsumoTotalPorPeriodo() {
  periodos.forEach((periodo) => {
    const consumosPeriodo = consumos.filter((c) => c.periodoId === periodo.id);
    const total = consumosPeriodo.reduce((sum, c) => sum + (c.consumoKwh || 0), 0);
    periodo.consumoTotal = total;

    // Sincronizar nombre del periodo en consumos relacionados
    consumos.forEach((consumo) => {
      if (consumo.periodoId === periodo.id) {
        consumo.periodoNombre = periodo.nombre;
      }
    });
  });
}

// Recalcular consumoPromedio de cada cliente
function recalcularConsumoPromedioClientes() {
  clientes.forEach((cliente) => {
    // Sincronizar datos del cliente en consumos relacionados
    consumos.forEach((consumo) => {
      if (consumo.codigo === cliente.codigo) {
        consumo.clienteNombre = cliente.nombre;
        consumo.bodega = cliente.bodega;
        consumo.local = cliente.local;
        consumo.estado = cliente.estado;
      }
    });

    // Sincronizar datos del cliente en prorrateos relacionados
    prorrateos.forEach((prorrateo) => {
      if (prorrateo.codigo === cliente.codigo) {
        prorrateo.clienteNombre = cliente.nombre;
        prorrateo.bodega = cliente.bodega;
        prorrateo.local = cliente.local;
        // Actualizar datos adicionales para el PDF
        prorrateo.direccion = cliente.direccion;
        prorrateo.nit = cliente.nit;
        prorrateo.telefono = cliente.telefono;
        prorrateo.factorMedida = cliente.factorMedida;
      }
    });

    // Recalcular promedio
    const consumosCliente = consumos.filter((c) => c.codigo === cliente.codigo);
    if (consumosCliente.length === 0) {
      cliente.consumoPromedio = 0;
    } else {
      const total = consumosCliente.reduce((sum, c) => sum + (c.consumoKwh || 0), 0);
      cliente.consumoPromedio = total / consumosCliente.length;
    }
  });
}

// Recalcular datos derivados
function recalcularDerivados() {
  recalcularConsumoTotalPorPeriodo();
  recalcularConsumoPromedioClientes();
}

function initWebsocket(io) {
  loadData();

  io.on("connection", (socket) => {
    console.log("Cliente conectado", socket.id);

    // Enviar datos iniciales
    socket.emit("clientes", clientes);
    socket.emit("periodos", periodos);
    socket.emit("consumos", consumos);
    socket.emit("prorrateos", prorrateos);

    // Evento para enviar los valores actuales cuando el cliente los pida
    socket.on("get-default-values", () => {
      socket.emit("default-values-loaded", defaultValues);
    });

    // Evento para guardar (asegúrate de que emita el éxito)
    socket.on("save-default-values", (values) => {
      defaultValues = values;
      saveJson(DEFAULT_VALUES_FILE, defaultValues);
      socket.emit("default-values-saved");
      // Enviar los valores por defecto al cliente
      socket.emit("default-values-loaded", defaultValues);
    });

    // Evento para aplicar valores por defecto (opcional, si necesitas procesamiento en el servidor)
    socket.on("apply-default-values", (values) => {
      // Este evento puede ser usado para cualquier procesamiento adicional
      // Por ahora solo lo reenviamos al cliente
      socket.emit("apply-default-values", values);
    });

    // =============== AUTENTICACIÓN ===============

    socket.on("login", ({ username, password }) => {
      if (username === auth.username && password === auth.password) {
        socket.emit("login-success");
      } else {
        socket.emit("login-error", "Usuario o contraseña incorrectos");
      }
    });

    socket.on("change-credentials", ({ newUser, newPass, currentPass }) => {
      // 1. Validar contraseña actual
      if (currentPass !== auth.password) {
        socket.emit("credentials-error", "La contraseña actual es incorrecta");
        return;
      }

      // 2. Actualizar solo lo que no esté vacío
      let cambios = false;
      if (newUser && newUser.trim() !== "") {
        auth.username = newUser;
        cambios = true;
      }
      if (newPass && newPass.trim() !== "") {
        auth.password = newPass;
        cambios = true;
      }

      if (cambios) {
        saveJson(AUTH_FILE, auth);
        socket.emit("credentials-changed");
      } else {
        socket.emit("credentials-error", "No se realizaron cambios");
      }
    });

    socket.on("save-default-values", (values) => {
      defaultValues = values;
      // Usamos la constante que acabamos de definir
      saveJson(DEFAULT_VALUES_FILE, defaultValues);

      // IMPORTANTE: Avisar al cliente que se guardó con éxito
      socket.emit("default-values-saved");
    });

    // =============== CLIENTES ===============

    socket.on("save-cliente", (cliente) => {
      // Validar que el código no se repita (excepto si es edición)
      const codigoExiste = clientes.find((c) => c.codigo === cliente.codigo && c.id !== cliente.id);
      if (codigoExiste) {
        socket.emit("error-cliente", "El código ya existe");
        return;
      }

      const index = clientes.findIndex((c) => c.id === cliente.id);
      if (index >= 0) {
        // Mantener consumoPromedio existente
        cliente.consumoPromedio = clientes[index].consumoPromedio || 0;
        clientes[index] = cliente;
      } else {
        cliente.consumoPromedio = 0;
        clientes.push(cliente);
      }

      saveJson(CLIENTES_FILE, clientes);

      // Recalcular derivados
      recalcularDerivados();

      // Emitir todos los datos actualizados
      io.emit("clientes", clientes);
      io.emit("consumos", consumos);
      io.emit("prorrateos", prorrateos);
    });

    socket.on("delete-cliente", (id) => {
      const cliente = clientes.find((c) => c.id === id);
      if (!cliente) {
        socket.emit("error-cliente", "Cliente no encontrado");
        return;
      }

      // Eliminar consumos asociados al cliente
      consumos = consumos.filter((c) => c.codigo !== cliente.codigo);

      // Eliminar prorrateos asociados al cliente
      prorrateos = prorrateos.filter((p) => p.codigo !== cliente.codigo);

      // Eliminar el cliente
      clientes = clientes.filter((c) => c.id !== id);

      // Recalcular derivados
      recalcularDerivados();

      // Guardar
      saveJson(CLIENTES_FILE, clientes);
      saveJson(CONSUMOS_FILE, consumos);
      saveJson(PRORRATEOS_FILE, prorrateos);
      saveJson(PERIODOS_FILE, periodos);

      // Emitir datos actualizados
      io.emit("clientes", clientes);
      io.emit("consumos", consumos);
      io.emit("prorrateos", prorrateos);
      io.emit("periodos", periodos);
    });

    // =============== PERIODOS ===============

    socket.on("save-periodo", (periodo) => {
      // Calcular días facturados
      const dias = calcularDiasFacturados(periodo.fechaInicio, periodo.fechaFin);

      const index = periodos.findIndex((p) => p.id === periodo.id);
      if (index >= 0) {
        const consumoActual = periodos[index].consumoTotal || 0;
        periodos[index] = {
          ...periodo,
          diasFacturados: dias,
          consumoTotal: consumoActual,
        };
      } else {
        periodos.push({
          ...periodo,
          diasFacturados: dias,
          consumoTotal: 0,
        });

        // Organizar cronológicamente los periodos
        periodos.sort((a, b) => {
          const mesA = parseInt(a.nombre.substring(0, 2));
          const anioA = parseInt(a.nombre.substring(2));
          const mesB = parseInt(b.nombre.substring(0, 2));
          const anioB = parseInt(b.nombre.substring(2));

          if (anioA !== anioB) {
            return anioA - anioB;
          }
          return mesA - mesB;
        });
      }

      // Ordenar periodos cronológicamente por nombre (formato MMYYYY)
      periodos.sort((a, b) => {
        const numA = parseInt(a.nombre);
        const numB = parseInt(b.nombre);
        return numA - numB;
      });

      // Recalcular derivados
      recalcularDerivados();
      saveJson(PERIODOS_FILE, periodos);

      // Emitir datos actualizados
      io.emit("periodos", periodos);
      io.emit("consumos", consumos);
      io.emit("prorrateos", prorrateos);
    });
    socket.on("delete-periodo", (id) => {
      // Eliminar consumos asociados a este periodo
      consumos = consumos.filter((c) => c.periodoId !== id);
      // Eliminar el periodo
      periodos = periodos.filter((p) => p.id !== id);

      // Recalcular derivados
      recalcularDerivados();

      // Guardar
      saveJson(PERIODOS_FILE, periodos);
      saveJson(CONSUMOS_FILE, consumos);
      saveJson(CLIENTES_FILE, clientes);

      io.emit("periodos", periodos);
      io.emit("consumos", consumos);
      io.emit("clientes", clientes);
    });

    // =============== CONSUMOS ===============

    socket.on("save-consumo", (data) => {
      const cliente = clientes.find((c) => c.codigo === data.codigo);
      const periodo = periodos.find((p) => p.id === data.periodoId);

      if (!cliente) {
        socket.emit("error-consumo", "El código de cliente no existe");
        return;
      }

      if (!periodo) {
        socket.emit("error-consumo", "El periodo no existe");
        return;
      }

      const factor = parseFloat(cliente.factorMedida) || 1;
      const lecturaAnterior = parseFloat(data.lecturaAnterior) || 0;
      const lecturaActual = parseFloat(data.lecturaActual) || 0;
      const impuestoSeguridad = parseFloat(data.impuestoSeguridad) || 0;
      const otrosConceptos = parseFloat(data.otrosConceptos) || 0;

      if (lecturaAnterior > lecturaActual) {
        socket.emit("error-consumo", "La lectura anterior debe ser menor o igual a la lectura actual");
        return;
      }

      // FÓRMULA DOCUMENTO: Consumo = (Lectura Actual – Lectura Anterior) * Factor de medida
      const consumoKwh = (lecturaActual - lecturaAnterior) * factor;

      // FÓRMULA DOCUMENTO: Valor facturado = Consumo * (1 + % Contribución) + Impuesto + Otros
      const cu = parseFloat(periodo.costoUnitario) || 0;
      const contribucion = parseFloat(periodo.porcentajeContribucion) || 0;

      const valorBase = consumoKwh * cu * (1 + contribucion);
      let valorFacturado = valorBase + impuestoSeguridad + otrosConceptos;

      // Aplicar ajuste a múltiplo de 10 si está marcado
      if (data.ajustarMultiplo10) {
        valorFacturado = Math.round(valorFacturado / 10) * 10;
      }

      const nuevoConsumo = {
        id: data.id || Date.now().toString(),
        periodoId: data.periodoId,
        periodoNombre: periodo.nombre,
        codigo: data.codigo,
        bodega: cliente.bodega,
        local: cliente.local,
        clienteNombre: cliente.nombre,
        estado: cliente.estado,
        lecturaAnterior,
        lecturaActual,
        impuestoSeguridad,
        otrosConceptos,
        consumoKwh,
        valorFacturado,
      };

      const index = consumos.findIndex((c) => c.id === nuevoConsumo.id);
      if (index >= 0) {
        consumos[index] = nuevoConsumo;
      } else {
        consumos.push(nuevoConsumo);
      }

      // Recalcular derivados
      recalcularDerivados();

      // Guardar
      saveJson(CONSUMOS_FILE, consumos);
      saveJson(PERIODOS_FILE, periodos);
      saveJson(CLIENTES_FILE, clientes);

      // Emitir datos actualizados
      io.emit("consumos", consumos);
      io.emit("periodos", periodos);
      io.emit("clientes", clientes);
      io.emit("prorrateos", prorrateos); // Emitir prorrateos también por si hay dependencias
      socket.emit("save-consumo-success");
    });

    socket.on("delete-consumo", (id) => {
      consumos = consumos.filter((c) => c.id !== id);

      // Recalcular derivados
      recalcularDerivados();

      saveJson(CONSUMOS_FILE, consumos);
      saveJson(PERIODOS_FILE, periodos);
      saveJson(CLIENTES_FILE, clientes);

      io.emit("consumos", consumos);
      io.emit("periodos", periodos);
      io.emit("clientes", clientes);
    });

    // GRUPOS DE FACTURACIÓN
    socket.emit("grupos", grupos);

    socket.on("save-grupo", (grupo) => {
      const index = grupos.findIndex((g) => g.id === grupo.id);
      if (index >= 0) {
        grupos[index] = grupo;
      } else {
        grupos.push(grupo);
      }
      saveJson(GRUPOS_FILE, grupos);
      io.emit("grupos", grupos);
    });

    socket.on("delete-grupo", (id) => {
      grupos = grupos.filter((g) => g.id !== id);
      saveJson(GRUPOS_FILE, grupos);
      io.emit("grupos", grupos);
    });

    // =============== PRORRATEO ===============

    socket.on("save-prorrateo", (data) => {
      const cliente = clientes.find((c) => c.codigo === data.codigo);

      if (!cliente) {
        socket.emit("error-prorrateo", "El código de cliente no existe");
        return;
      }

      // Buscar el último periodo para obtener CU y Contribución por defecto
      const ultimoPeriodo = periodos.length > 0 ? periodos[periodos.length - 1] : null;

      const dias = calcularDiasFacturados(data.fechaInicio, data.fechaEntrega);
      const factor = parseFloat(cliente.factorMedida) || 1;
      const lecturaAnterior = parseFloat(data.lecturaAnterior) || 0;
      const lecturaActual = parseFloat(data.lecturaActual) || 0;
      const impuestoSeguridad = parseFloat(data.impuestoSeguridad) || 0;
      const otrosConceptos = parseFloat(data.otrosConceptos) || 0;

      // FÓRMULA DOCUMENTO: Consumo base
      const consumoBase = (lecturaActual - lecturaAnterior) * factor;

      // Usar valores manuales si están presentes, de lo contrario usar los del último periodo
      const cu = data.cuManual !== undefined ? parseFloat(data.cuManual) : ultimoPeriodo ? parseFloat(ultimoPeriodo.costoUnitario) || 0 : 0;
      const contribucion = data.contribucionManual !== undefined ? parseFloat(data.contribucionManual) / 100 : ultimoPeriodo ? parseFloat(ultimoPeriodo.porcentajeContribucion) || 0 : 0;

      const valorEnergia = consumoBase * cu;
      const valorContribucion = valorEnergia * contribucion;

      // FÓRMULA DOCUMENTO: Impuesto parcial = (Días / 30) * Impuesto Total
      const impuestoParcial = (dias / 30) * impuestoSeguridad;

      // Valor prorrateado final
      const valorProrrateado = valorEnergia + valorContribucion + impuestoParcial + otrosConceptos;

      const nuevoProrrateo = {
        id: data.id || Date.now().toString(),
        codigo: data.codigo,
        bodega: cliente.bodega,
        local: cliente.local,
        clienteNombre: cliente.nombre,
        fechaInicio: data.fechaInicio,
        fechaEntrega: data.fechaEntrega,
        lecturaAnterior,
        lecturaActual,
        porcentajeContribucion: contribucion,
        costoUnitario: cu,
        impuestoSeguridad,
        otrosConceptos,
        diasFacturados: dias,
        consumoKwh: consumoBase,
        impuestoParcial,
        valorProrrateado,
        // Datos adicionales del cliente para el PDF
        direccion: cliente.direccion,
        nit: cliente.nit,
        telefono: cliente.telefono,
        factorMedida: cliente.factorMedida,
        // Guardar los valores manuales si fueron proporcionados
        ...(data.cuManual !== undefined && { cuManual: parseFloat(data.cuManual) }),
        ...(data.contribucionManual !== undefined && { contribucionManual: parseFloat(data.contribucionManual) }),
      };

      const index = prorrateos.findIndex((p) => p.id === nuevoProrrateo.id);
      if (index >= 0) {
        prorrateos[index] = nuevoProrrateo;
      } else {
        prorrateos.push(nuevoProrrateo);
      }

      saveJson(PRORRATEOS_FILE, prorrateos);
      io.emit("prorrateos", prorrateos);
    });

    socket.on("delete-prorrateo", (id) => {
      prorrateos = prorrateos.filter((p) => p.id !== id);
      saveJson(PRORRATEOS_FILE, prorrateos);
      io.emit("prorrateos", prorrateos);
    });

    socket.on("disconnect", () => {
      console.log("Cliente desconectado", socket.id);
    });
  });
}

module.exports = { initWebsocket };
