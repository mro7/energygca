const socket = io();

// Variables globales
let clientes = [];
let periodos = [];
let consumos = [];
let grupos = [];
let clientesTemporalesGrupo = []; // Para manejar la lista antes de guardar
let prorrateos = [];

// Variables de paginación
const REGISTROS_POR_PAGINA = 25;
let paginasActuales = {
  clientes: 1,
  periodos: 1,
  consumos: 1,
  prorrateos: 1,
};

// Formato de moneda colombiana
const formatCOP = (valor) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor || 0);
};

// Función genérica para obtener datos paginados
function obtenerDatosPaginados(datos, paginaActual) {
  const inicio = (paginaActual - 1) * REGISTROS_POR_PAGINA;
  const fin = inicio + REGISTROS_POR_PAGINA;
  return {
    items: datos.slice(inicio, fin),
    totalPaginas: Math.ceil(datos.length / REGISTROS_POR_PAGINA),
    totalRegistros: datos.length,
  };
}

function refrescarTodasLasTablas() {
  aplicarFiltrosClientes();
  aplicarFiltrosConsumos();
  renderGrupos();
  renderPeriodos();
  actualizarEstadisticasClientes();
}

// Función para renderizar los controles de paginación
function renderizarControlesPaginacion(modulo, totalPaginas, paginaActual, callback) {
  const contenedor = document.getElementById(`controles-paginacion-${modulo}`);
  const info = document.getElementById(`info-paginacion-${modulo}`);
  if (!contenedor) return;

  contenedor.innerHTML = "";

  // Botón Anterior
  const btnPrev = document.createElement("button");
  btnPrev.className = `px-3 py-1 rounded ${paginaActual === 1 ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600"}`;
  btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
  btnPrev.disabled = paginaActual === 1;
  btnPrev.onclick = () => {
    if (paginaActual > 1) {
      paginasActuales[modulo]--;
      callback();
    }
  };
  contenedor.appendChild(btnPrev);

  // Número de página
  const span = document.createElement("span");
  span.className = "px-4 py-1 font-semibold text-slate-700";
  span.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
  contenedor.appendChild(span);

  // Botón Siguiente
  const btnNext = document.createElement("button");
  btnNext.className = `px-3 py-1 rounded ${paginaActual >= totalPaginas ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600"}`;
  btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
  btnNext.disabled = paginaActual >= totalPaginas;
  btnNext.onclick = () => {
    if (paginaActual < totalPaginas) {
      paginasActuales[modulo]++;
      callback();
    }
  };
  contenedor.appendChild(btnNext);
}

// ==================== AUTENTICACIÓN ====================

document.getElementById("form-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  socket.emit("login", { username, password });
});

socket.on("login-success", () => {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("username", data.username);
  Swal.fire({
    icon: "success",
    title: "¡Bienvenido!",
    text: "Inicio de sesión exitoso",
    timer: 1500,
    showConfirmButton: false,
  });
});

socket.on("login-error", (mensaje) => {
  Swal.fire({
    icon: "error",
    title: "Error",
    text: mensaje,
  });
});

function logout() {
  Swal.fire({
    title: "¿Cerrar sesión?",
    text: "¿Estás seguro de que deseas salir?",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#3b82f6",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Sí, salir",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      document.getElementById("main-app").classList.add("hidden");
      document.getElementById("login-screen").classList.remove("hidden");
      document.getElementById("login-username").value = "";
      document.getElementById("login-password").value = "";
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("username");
      location.reload();
      Swal.fire({
        icon: "success",
        title: "Sesión cerrada",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const savedUsername = localStorage.getItem("username");

  if (isLoggedIn === "true") {
    // Ocultar login y mostrar app automáticamente
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");

    // Si tienes un elemento para mostrar el nombre, actualízalo
    const userDisplay = document.getElementById("username-display");
    if (userDisplay && savedUsername) {
      userDisplay.textContent = savedUsername;
    }

    // Opcional: Solicitar datos iniciales al servidor si es necesario
    socket.emit("get-initial-data");
  }

  // Si ya hay datos en la variable global (porque llegaron por socket rápido)
  if (periodos.length > 0) {
    actualizarSelectoresPeriodos();
  }

  // Listener para cambios en el estado del cliente
  const estadoSelect = document.getElementById("cli-estado");
  if (estadoSelect) {
    estadoSelect.addEventListener("change", function () {
      if (this.value === "Desocupado") {
        // Solicitar los valores por defecto al servidor
        socket.emit("get-default-values");
      }
    });
  }

  // Inicializar checkbox de ajuste a múltiplo de 10 (marcado por defecto)
  const checkboxMultiplo = document.getElementById("con-ajustar-multiplo");
  if (checkboxMultiplo) {
    checkboxMultiplo.checked = true;
  }
});

// Variables para controlar el timeout del autocompletado
let clienteTimeout;
let adminTimeout;

// Función para mostrar sugerencias de clientes
function mostrarSugerenciasClientes(query) {
  if (!query || query.length < 2) {
    document.getElementById("suggestions-clientes").classList.add("hidden");
    return;
  }

  // 1. Filtrar por coincidencia
  const coincidencias = clientes.filter((cliente) => cliente.nombre && cliente.nombre.toLowerCase().includes(query.toLowerCase()));

  // 2. Eliminar duplicados basados en el nombre del cliente
  const clientesUnicos = [];
  const nombresVistos = new Set();

  coincidencias.forEach((c) => {
    const nombreNormalizado = c.nombre.trim().toLowerCase();
    if (!nombresVistos.has(nombreNormalizado)) {
      nombresVistos.add(nombreNormalizado);
      clientesUnicos.push(c);
    }
  });

  const suggestionsContainer = document.getElementById("suggestions-clientes");

  if (clientesUnicos.length === 0) {
    suggestionsContainer.classList.add("hidden");
    return;
  }

  let suggestionsHTML = "";
  clientesUnicos.forEach((cliente) => {
    // Escapar comillas para evitar errores en el onclick
    const nombreEscapado = cliente.nombre.replace(/'/g, "\\'");
    const adminEscapado = cliente.administrador.replace(/'/g, "\\'");

    suggestionsHTML += `
      <div class="px-4 py-2 hover:bg-blue-100 cursor-pointer border-b border-slate-100 last:border-b-0"
           onclick="seleccionarCliente('${nombreEscapado}', '${adminEscapado}', '${cliente.nit}')">
        <div class="font-medium text-slate-800">${cliente.nombre}</div>
        <div class="text-xs text-slate-500">NIT: ${cliente.nit}</div>
      </div>
    `;
  });

  suggestionsContainer.innerHTML = suggestionsHTML;
  suggestionsContainer.classList.remove("hidden");
}

// Función para mostrar sugerencias de administradores
function mostrarSugerenciasAdmins(query) {
  if (!query || query.length < 2) {
    document.getElementById("suggestions-admins").classList.add("hidden");
    return;
  }

  // Obtener administradores únicos de los clientes existentes
  const adminsUnicos = [...new Set(clientes.map((c) => c.administrador).filter(Boolean))];
  const coincidencias = adminsUnicos.filter((admin) => admin.toLowerCase().includes(query.toLowerCase()));

  const suggestionsContainer = document.getElementById("suggestions-admins");

  if (coincidencias.length === 0) {
    suggestionsContainer.classList.add("hidden");
    return;
  }

  // Generar HTML para las sugerencias
  let suggestionsHTML = "";
  coincidencias.forEach((admin) => {
    suggestionsHTML += `
      <div class="px-4 py-2 hover:bg-blue-100 cursor-pointer border-b border-slate-100 last:border-b-0"
           onclick="seleccionarAdministrador('${admin.replace(/'/g, "\\'")}')">
        <div class="font-medium">${admin}</div>
      </div>
    `;
  });

  suggestionsContainer.innerHTML = suggestionsHTML;
  suggestionsContainer.classList.remove("hidden");
}

// Función para seleccionar un cliente de las sugerencias
function seleccionarCliente(nombre, administrador, nit) {
  document.getElementById("cli-nombre").value = nombre;
  document.getElementById("cli-administrador").value = administrador;
  document.getElementById("cli-nit").value = nit;

  // Ocultar las sugerencias
  document.getElementById("suggestions-clientes").classList.add("hidden");
}

// Función para seleccionar un administrador de las sugerencias
function seleccionarAdministrador(administrador) {
  document.getElementById("cli-administrador").value = administrador;

  // Ocultar las sugerencias
  document.getElementById("suggestions-admins").classList.add("hidden");

  // Opcional: Buscar si existe un cliente con este administrador para autocompletar NIT
  const clienteConAdmin = clientes.find((c) => c.administrador === administrador);
  if (clienteConAdmin) {
    document.getElementById("cli-nit").value = clienteConAdmin.nit;
  }
}

// Event listeners para los campos de autocompletado
document.addEventListener("DOMContentLoaded", () => {
  // Autocompletado para nombre de cliente
  document.getElementById("cli-nombre").addEventListener("input", function () {
    clearTimeout(clienteTimeout);
    clienteTimeout = setTimeout(() => {
      mostrarSugerenciasClientes(this.value);
    }, 300); // Esperar 300ms después de dejar de escribir
  });

  // Autocompletado para administrador
  document.getElementById("cli-administrador").addEventListener("input", function () {
    clearTimeout(adminTimeout);
    adminTimeout = setTimeout(() => {
      mostrarSugerenciasAdmins(this.value);
    }, 300); // Esperar 300ms después de dejar de escribir
  });

  // Ocultar sugerencias al hacer clic fuera
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#cli-nombre") && !e.target.closest("#suggestions-clientes")) {
      document.getElementById("suggestions-clientes").classList.add("hidden");
    }
    if (!e.target.closest("#cli-administrador") && !e.target.closest("#suggestions-admins")) {
      document.getElementById("suggestions-admins").classList.add("hidden");
    }
  });

  // Ocultar sugerencias con la tecla Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.getElementById("suggestions-clientes").classList.add("hidden");
      document.getElementById("suggestions-admins").classList.add("hidden");
    }
  });
});

// Modificar la función de autocompletado para prorrateo
document.getElementById("pro-codigo").addEventListener("change", (e) => {
  const codigo = e.target.value;
  const cliente = clientes.find((c) => c.codigo === codigo);

  if (cliente) {
    // Traer lectura anterior automáticamente
    const consumosCliente = consumos
      .filter((c) => c.codigo === codigo)
      .sort((a, b) => {
        return new Date(b.periodoNombre) - new Date(a.periodoNombre);
      });

    if (consumosCliente.length > 0) {
      document.getElementById("pro-lectura-anterior").value = consumosCliente[0].lecturaActual || 0;
    }

    // Asignar fecha de inicio por defecto (última fecha límite del último periodo)
    if (periodos.length > 0) {
      const ultimoPeriodo = periodos[periodos.length - 1];
      document.getElementById("pro-fecha-inicio").value = ultimoPeriodo.fechaFin || "";
    }
  } else {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "El código de cliente no existe",
    });
    e.target.value = "";
  }
});

// Cambiar credenciales

// Manejo de Credenciales (Izquierda)
document.getElementById("form-config-auth").addEventListener("submit", (e) => {
  e.preventDefault();
  const newUser = document.getElementById("config-username").value;
  const newPass = document.getElementById("config-password").value;
  const currentPass = document.getElementById("config-current-password").value;

  if (!newUser && !newPass) {
    Swal.fire("Info", "No has ingresado nuevos datos para cambiar", "info");
    return;
  }

  socket.emit("change-credentials", {
    newUser,
    newPass,
    currentPass,
  });
});

// Manejo de Valores por Defecto (Derecha)
document.getElementById("form-config-defaults").addEventListener("submit", (e) => {
  e.preventDefault();
  const defaultValues = {
    cliente: document.getElementById("config-default-cliente").value,
    administrador: document.getElementById("config-default-admin").value,
    nit: document.getElementById("config-default-nit").value,
    telefono: document.getElementById("config-default-telefono").value,
  };
  socket.emit("save-default-values", defaultValues);
});

socket.on("credentials-changed", () => {
  closeModal("modal-config");
  Swal.fire({
    icon: "success",
    title: "Credenciales actualizadas",
    text: "Las credenciales se han cambiado correctamente",
    timer: 2000,
    showConfirmButton: false,
  });
  document.getElementById("form-config").reset();
});

// Escuchar respuesta de error de credenciales
socket.on("credentials-error", (msg) => {
  Swal.fire("Error", msg, "error");
});

socket.on("default-values-saved", () => {
  closeModal("modal-config");
  Swal.fire({
    icon: "success",
    title: "Configuración guardada",
    text: "Los valores por defecto para locales desocupados se actualizaron correctamente.",
    timer: 2000,
    showConfirmButton: false,
  });
});

// ==================== NAVEGACIÓN ====================

function showModule(moduleName) {
  // Ocultar todos los módulos
  document.querySelectorAll(".module-section").forEach((section) => {
    section.classList.add("hidden");
  });

  // Mostrar el módulo seleccionado
  document.getElementById(`mod-${moduleName}`).classList.remove("hidden");

  // Actualizar botones de navegación
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.closest(".nav-btn").classList.add("active");
}

// ==================== MODALES ====================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.add("active"), 10);

  // Si se abre el modal de configuración, pedimos los valores al servidor
  if (modalId === "modal-config") {
    socket.emit("get-default-values");
  }

  // Limpiar sugerencias al abrir el modal de clientes
  if (modalId === "modal-cliente") {
    document.getElementById("suggestions-clientes").classList.add("hidden");
    document.getElementById("suggestions-admins").classList.add("hidden");
  }

  // Limpiar id
  if (modalId === "modal-grupo") {
    document.getElementById("form-grupo").reset();
    document.getElementById("grupo-id").value = "";
  }

  // Si se abre el modal de prorrateo, limpiar los campos manuales
  if (modalId === "modal-prorrateo") {
    document.getElementById("pro-cu-manual").value = "";
    document.getElementById("pro-contribucion-manual").value = "";
  }

  // Si se abre el modal de consumo, marcar checkbox por defecto
  if (modalId === "modal-consumo") {
    const checkboxMultiplo = document.getElementById("con-ajustar-multiplo");
    if (checkboxMultiplo) {
      checkboxMultiplo.checked = true;
    }

    const periodoFiltro = document.getElementById("filtro-periodo-consumo");
    const periodoForm = document.getElementById("con-periodo");

    if (periodoFiltro && periodoFiltro.value && periodoForm) {
      periodoForm.value = periodoFiltro.value;
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove("active");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);

  // Reiniciar campos del modal de consumo al cerrarlo
  if (modalId === "modal-consumo") {
    document.getElementById("form-consumo").reset();
    document.getElementById("consumo-id").value = "";
    document.getElementById("con-bodega").value = "";
    document.getElementById("con-local").value = "";
    document.getElementById("con-cliente").value = "";
    document.getElementById("con-estado").value = "";
  }
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    // Cierra cualquier modal abierto
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((modal) => {
      closeModal(modal.id);
    });
  }
});

// Receptor para llenar los campos cuando lleguen los datos del servidor
socket.on("default-values-loaded", (values) => {
  if (values) {
    document.getElementById("config-default-cliente").value = values.cliente || "";
    document.getElementById("config-default-admin").value = values.administrador || "";
    document.getElementById("config-default-nit").value = values.nit || "";
    document.getElementById("config-default-telefono").value = values.telefono || "";
  }
});

// ==================== CLIENTES ====================

socket.on("clientes", (data) => {
  clientes = data;
  aplicarFiltrosClientes();
  actualizarEstadisticasClientes();
  refrescarTodasLasTablas();
});

socket.on("error-cliente", (mensaje) => {
  Swal.fire({
    icon: "error",
    title: "Error",
    text: mensaje,
  });
});

// Receptor para aplicar valores por defecto cuando el usuario confirma
socket.on("apply-default-values", (defaultValues) => {
  if (defaultValues) {
    document.getElementById("cli-nombre").value = defaultValues.cliente || "";
    document.getElementById("cli-administrador").value = defaultValues.administrador || "";
    document.getElementById("cli-nit").value = defaultValues.nit || "";
    document.getElementById("cli-telefono").value = defaultValues.telefono || "";
  }
});

// Receptor para recibir los valores por defecto del servidor
socket.on("default-values-loaded", (values) => {
  // Cuando se reciben los valores, preguntar si se quieren aplicar
  if (document.getElementById("cli-estado").value === "Desocupado") {
    Swal.fire({
      title: "¿Aplicar valores por defecto?",
      text: "¿Deseas asignar los valores por defecto para locales desocupados?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, aplicar",
      cancelButtonText: "No, ingresar manualmente",
    }).then((result) => {
      if (result.isConfirmed) {
        // Aplicar los valores
        socket.emit("apply-default-values", values);
      }
    });
  }
});

function renderClientes(datos = clientes) {
  // Si no se pasan datos (ej. refresco general), usamos los filtros actuales para obtener el array correcto
  const { items, totalPaginas, totalRegistros } = obtenerDatosPaginados(datos, paginasActuales.clientes);
  const tbody = document.getElementById("lista-clientes");

  // Limpiamos el contenido una sola vez al inicio
  tbody.innerHTML = "";

  // Si no hay resultados, mostrar mensaje amigable
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="px-4 py-8 text-center text-slate-500 italic">No se encontraron clientes con los filtros aplicados</td></tr>`;
  } else {
    items.forEach((cliente) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 transition-all border-b border-slate-100";
      const estadoBadge = cliente.estado === "Ocupado" ? '<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Ocupado</span>' : '<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Desocupado</span>';

      tr.innerHTML = `
              <td class="px-4 py-3 font-medium text-slate-900">${cliente.codigo || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.bodega || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.local || ""}</td>
              <td class="px-4 py-3 text-slate-900 font-medium">${cliente.nombre || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.administrador || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.direccion || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.nit || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.telefono || ""}</td>
              <td class="px-4 py-3 text-slate-600">${cliente.factorMedida || 1}</td>
              <td class="px-4 py-3 text-slate-900 font-semibold">${(cliente.consumoPromedio || 0).toFixed(2)}</td>
              <td class="px-4 py-3">${estadoBadge}</td>
              <td class="px-4 py-3 text-right">
                  <button onclick="editarCliente('${cliente.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Editar"><i class="fas fa-edit"></i></button>
                  <button onclick="eliminarCliente('${cliente.id}')" class="text-red-600 hover:text-red-800 mr-3" title="Eliminar"><i class="fas fa-trash"></i></button>
                  <button onclick="verHistoricoCliente('${cliente.codigo}')" class="text-green-600 hover:text-green-800" title="Histórico"><i class="fas fa-history"></i></button>
              </td>
          `;
      tbody.appendChild(tr);
    });
  }

  // Actualizar info y controles de paginación
  document.getElementById("info-paginacion-clientes").textContent = `Mostrando ${items.length} de ${totalRegistros} clientes`;
  renderizarControlesPaginacion("clientes", totalPaginas, paginasActuales.clientes, () => aplicarFiltrosClientes());
}

function aplicarFiltrosClientes() {
  const busqueda = document.getElementById("filtroGeneralClientes").value.toLowerCase();
  const bodega = document.getElementById("filtroBodega").value.toLowerCase();
  const local = document.getElementById("filtroLocal").value.toLowerCase();
  const estado = document.getElementById("filtroEstado").value;

  // FILTRADO PREVIO: Filtramos el array en memoria ANTES de tocar el DOM
  const filtrados = clientes.filter((c) => {
    const matchEstado = !estado || c.estado === estado;
    const matchBodega = !bodega || (c.bodega || "").toString().toLowerCase().includes(bodega);
    const matchLocal = !local || (c.local || "").toString().toLowerCase().includes(local);
    const terminosUnificados = [c.codigo, c.nombre, c.administrador, c.nit].map((v) => (v || "").toString().toLowerCase());
    const matchBusqueda = !busqueda || terminosUnificados.some((t) => t.includes(busqueda));

    return matchEstado && matchBodega && matchLocal && matchBusqueda;
  });

  // Renderizar tabla directamente con los resultados ya filtrados
  renderClientes(filtrados);

  // Actualizar estadísticas basadas en el array filtrado
  document.getElementById("total-filtrados").textContent = filtrados.length;
  document.getElementById("total-ocupados").textContent = filtrados.filter((c) => c.estado === "Ocupado").length;
  document.getElementById("total-desocupados").textContent = filtrados.filter((c) => c.estado === "Desocupado").length;
}

// Función para limpiar todos los filtros
function limpiarFiltrosClientes() {
  document.getElementById("filtroGeneralClientes").value = "";
  document.getElementById("filtroBodega").value = "";
  document.getElementById("filtroLocal").value = "";
  document.getElementById("filtroEstado").value = "";
  paginasActuales.clientes = 1; // Resetear a primera página
  renderClientes(clientes); // Mostrar todos los clientes
}

// Event listeners para filtros de clientes
document.getElementById("filtroGeneralClientes").addEventListener("input", () => {
  paginasActuales.clientes = 1; // Resetear a primera página al filtrar
  aplicarFiltrosClientes();
});
document.getElementById("filtroBodega").addEventListener("input", () => {
  paginasActuales.clientes = 1; // Resetear a primera página al filtrar
  aplicarFiltrosClientes();
});
document.getElementById("filtroLocal").addEventListener("input", () => {
  paginasActuales.clientes = 1; // Resetear a primera página al filtrar
  aplicarFiltrosClientes();
});
document.getElementById("filtroEstado").addEventListener("change", () => {
  paginasActuales.clientes = 1; // Resetear a primera página al filtrar
  aplicarFiltrosClientes();
});

function actualizarEstadisticasClientes() {
  const total = clientes.length;
  const ocupados = clientes.filter((c) => c.estado === "Ocupado").length;
  const desocupados = total - ocupados;
  const porcOcupados = total > 0 ? ((ocupados / total) * 100).toFixed(1) : 0;
  const porcDesocupados = total > 0 ? ((desocupados / total) * 100).toFixed(1) : 0;

  document.getElementById("stat-total-clientes").textContent = total;
  document.getElementById("stat-ocupados").innerHTML = `${ocupados} <span class="text-lg text-slate-500">(${porcOcupados}%)</span>`;
  document.getElementById("stat-desocupados").innerHTML = `${desocupados} <span class="text-lg text-slate-500">(${porcDesocupados}%)</span>`;
}

document.getElementById("form-cliente").addEventListener("submit", (e) => {
  e.preventDefault();

  const cliente = {
    id: document.getElementById("cliente-id").value || Date.now().toString(),
    codigo: document.getElementById("cli-codigo").value,
    bodega: document.getElementById("cli-bodega").value,
    local: document.getElementById("cli-local").value,
    nombre: document.getElementById("cli-nombre").value,
    administrador: document.getElementById("cli-administrador").value,
    direccion: document.getElementById("cli-direccion").value,
    nit: document.getElementById("cli-nit").value,
    telefono: document.getElementById("cli-telefono").value,
    factorMedida: parseFloat(document.getElementById("cli-factor").value) || 1,
    estado: document.getElementById("cli-estado").value,
    consumoPromedio: 0,
  };

  socket.emit("save-cliente", cliente);
  closeModal("modal-cliente");
  document.getElementById("form-cliente").reset();
  document.getElementById("cliente-id").value = "";

  Swal.fire({
    icon: "success",
    title: "Cliente guardado",
    timer: 1500,
    showConfirmButton: false,
  });

  // Mantener filtros aplicados después de guardar
  setTimeout(() => aplicarFiltrosClientes(), 200);
});

function editarCliente(id) {
  const cliente = clientes.find((c) => c.id === id);
  if (!cliente) return;

  document.getElementById("cliente-id").value = cliente.id;
  document.getElementById("cli-codigo").value = cliente.codigo || "";
  document.getElementById("cli-bodega").value = cliente.bodega || "";
  document.getElementById("cli-local").value = cliente.local || "";
  document.getElementById("cli-nombre").value = cliente.nombre || "";
  document.getElementById("cli-administrador").value = cliente.administrador || "";
  document.getElementById("cli-direccion").value = cliente.direccion || "";
  document.getElementById("cli-nit").value = cliente.nit || "";
  document.getElementById("cli-telefono").value = cliente.telefono || "";
  document.getElementById("cli-factor").value = cliente.factorMedida || 1;
  document.getElementById("cli-estado").value = cliente.estado || "Ocupado";

  openModal("modal-cliente");
}

function eliminarCliente(id) {
  Swal.fire({
    title: "¿Eliminar cliente?",
    text: "Esta acción también eliminará todos los consumos y prorrateos asociados",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit("delete-cliente", id);
      Swal.fire({
        icon: "success",
        title: "Cliente eliminado",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

//Ver histórico de

let historicoChart = null;

function verHistoricoCliente(codigo) {
  const consumosCliente = consumos.filter((c) => c.codigo === codigo);

  if (consumosCliente.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Sin histórico",
      text: "Este cliente no tiene consumos registrados",
    });
    return;
  }

  // Crear contenido del modal
  let html = `
    <div class="text-left">
      <!-- Selector de vista -->
      <div class="mb-4">
        <label for="vista-consumos" class="block text-sm font-medium text-gray-700 mb-1">Seleccionar vista:</label>
        <select id="vista-consumos" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
          <option value="ultimos">Últimos 6 consumos</option>
          <option value="anio">Consumos por año</option>
        </select>
      </div>

      <!-- Selector de año (inicialmente oculto) -->
      <div id="selector-anio" class="mb-4 hidden">
        <label for="anio-consumos" class="block text-sm font-medium text-gray-700 mb-1">Seleccionar año:</label>
        <select id="anio-consumos" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
          ${Array.from(new Set(consumosCliente.map((c) => c.periodoNombre.substring(2))))
            .map((anio) => `<option value="${anio}">${anio}</option>`)
            .join("")}
        </select>
      </div>

      <!-- Gráfica de consumos -->
      <div class="mb-6">
        <canvas id="historico-consumo-chart" width="400" height="200"></canvas>
      </div>

      <!-- Tabla de consumos -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periodo</th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consumo [kWh]</th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
            </tr>
          </thead>
          <tbody id="tabla-consumos-body" class="bg-white divide-y divide-gray-200">
            ${generarFilasTabla(consumosCliente.slice(-6))}
          </tbody>
        </table>
      </div>
    </div>
  `;

  Swal.fire({
    title: `Histórico de Consumos - ${codigo}`,
    html: html,
    width: "700px",
    confirmButtonText: "Cerrar",
    didOpen: () => {
      // Inicializar gráfica con últimos 6 consumos
      renderHistoricoChart(consumosCliente.slice(-6));

      // Añadir event listeners
      document.getElementById("vista-consumos").addEventListener("change", function () {
        if (this.value === "anio") {
          document.getElementById("selector-anio").classList.remove("hidden");
          actualizarHistoricoConsumos(codigo);
        } else {
          document.getElementById("selector-anio").classList.add("hidden");
          actualizarHistoricoConsumos(codigo);
        }
      });

      document.getElementById("anio-consumos").addEventListener("change", function () {
        actualizarHistoricoConsumos(codigo);
      });
    },
    willClose: () => {
      // Destruir la gráfica al cerrar el modal
      if (historicoChart) {
        historicoChart.destroy();
        historicoChart = null;
      }
    },
  });
}

function generarFilasTabla(consumosFiltrados) {
  return consumosFiltrados
    .map(
      (c) => `
    <tr>
      <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${c.periodoNombre}</td>
      <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${c.consumoKwh.toFixed(2)}</td>
      <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${formatCOP(c.valorFacturado)}</td>
    </tr>
  `,
    )
    .join("");
}

function renderHistoricoChart(consumosFiltrados) {
  const ctx = document.getElementById("historico-consumo-chart").getContext("2d");

  // Destruir gráfica anterior si existe
  if (historicoChart) {
    historicoChart.destroy();
  }

  // Preparar datos
  const labels = consumosFiltrados.map((c) => c.periodoNombre);
  const data = consumosFiltrados.map((c) => c.consumoKwh);

  // Crear gráfica
  historicoChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Consumo (kWh)",
          data: data,
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "kWh",
          },
        },
        x: {
          title: {
            display: true,
            text: "Periodo",
          },
        },
      },
    },
  });
}

function actualizarHistoricoConsumos(codigo) {
  const vista = document.getElementById("vista-consumos").value;
  const consumosCliente = consumos.filter((c) => c.codigo === codigo);
  let consumosFiltrados = [];

  if (vista === "ultimos") {
    consumosFiltrados = consumosCliente.slice(-6);
  } else {
    const anio = document.getElementById("anio-consumos").value;
    consumosFiltrados = consumosCliente.filter((c) => c.periodoNombre.endsWith(anio));
  }

  // Actualizar tabla
  document.getElementById("tabla-consumos-body").innerHTML = generarFilasTabla(consumosFiltrados);

  // Actualizar gráfica
  renderHistoricoChart(consumosFiltrados);
}

// ==================== PERIODOS ====================

socket.on("periodos", (data) => {
  // Ordenar antes de asignar a la variable global
  periodos = data.sort((a, b) => {
    const mesA = parseInt(a.nombre.substring(0, 2));
    const anioA = parseInt(a.nombre.substring(2));
    const mesB = parseInt(b.nombre.substring(0, 2));
    const anioB = parseInt(b.nombre.substring(2));

    if (anioA !== anioB) return anioA - anioB;
    return mesA - mesB;
  });
  actualizarSelectoresPeriodos();
  renderPeriodos();
});

function renderPeriodos() {
  const { items, totalPaginas, totalRegistros } = obtenerDatosPaginados(periodos, paginasActuales.periodos);
  const tbody = document.getElementById("lista-periodos");
  tbody.innerHTML = "";

  items.forEach((periodo) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-all";

    tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-slate-900">${periodo.nombre || ""}</td>
            <td class="px-4 py-3 text-slate-600">${((periodo.porcentajeContribucion || 0) * 100).toFixed(2)}%</td>
            <td class="px-4 py-3 text-slate-900 font-semibold">${formatCOP(periodo.costoUnitario)}</td>
            <td class="px-4 py-3 text-slate-600">${periodo.fechaInicio || ""}</td>
            <td class="px-4 py-3 text-slate-600">${periodo.fechaFin || ""}</td>
            <td class="px-4 py-3 text-slate-900 font-semibold">${periodo.diasFacturados || 0}</td>
            <td class="px-4 py-3 text-slate-900 font-semibold">${(periodo.consumoTotal || 0).toFixed(2)}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="editarPeriodo('${periodo.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="eliminarPeriodo('${periodo.id}')" class="text-red-600 hover:text-red-800" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  // Actualizar info y controles
  renderizarControlesPaginacion("periodos", totalPaginas, paginasActuales.periodos, () => renderPeriodos());
}

function actualizarSelectoresPeriodos() {
  const selects = [
    { element: document.getElementById("con-periodo"), defaultOption: "Seleccionar Periodo" },
    { element: document.getElementById("filtro-periodo-consumo"), defaultOption: "Todos los Periodos" },
    { element: document.getElementById("filtro-grupos"), defaultOption: "Seleccionar Periodo" },
    { element: document.getElementById("grupo-periodo"), defaultOption: "Seleccionar Periodo" },
  ];

  selects.forEach(({ element, defaultOption }) => {
    if (element) {
      const valorPrevio = element.value;
      element.innerHTML = `<option value="">${defaultOption}</option>`;

      periodos.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.nombre;
        element.appendChild(option);
      });

      if (valorPrevio) {
        element.value = valorPrevio;
      }
    }
  });
}

document.getElementById("form-periodo").addEventListener("submit", (e) => {
  e.preventDefault();

  const fechaInicio = document.getElementById("per-fecha-inicio").value;
  const fechaFin = document.getElementById("per-fecha-fin").value;

  // Validación: Fecha Inicio <= Fecha Fin
  if (new Date(fechaInicio) > new Date(fechaFin)) {
    Swal.fire({
      icon: "error",
      title: "Error en fechas",
      text: "La fecha inicial no puede ser posterior a la fecha límite",
    });
    return;
  }

  const mes = document.getElementById("per-mes").value.padStart(2, "0");
  const anio = document.getElementById("per-anio").value;
  const nombre = mes + anio;

  const periodo = {
    id: document.getElementById("periodo-id").value || Date.now().toString(),
    nombre: nombre,
    porcentajeContribucion: parseFloat(document.getElementById("per-contribucion").value) / 100 || 0,
    costoUnitario: parseFloat(document.getElementById("per-costo").value) || 0,
    fechaInicio: document.getElementById("per-fecha-inicio").value,
    fechaFin: document.getElementById("per-fecha-fin").value,
  };

  socket.emit("save-periodo", periodo);
  closeModal("modal-periodo");
  document.getElementById("form-periodo").reset();
  document.getElementById("periodo-id").value = "";

  Swal.fire({
    icon: "success",
    title: "Periodo guardado",
    timer: 1500,
    showConfirmButton: false,
  });
});

function editarPeriodo(id) {
  const periodo = periodos.find((p) => p.id === id);
  if (!periodo) return;

  // Extraer mes y año del nombre (formato MMYYYY)
  const mes = periodo.nombre.substring(0, 2);
  const anio = periodo.nombre.substring(2);

  document.getElementById("periodo-id").value = periodo.id;
  document.getElementById("per-mes").value = parseInt(mes);
  document.getElementById("per-anio").value = anio;
  document.getElementById("per-contribucion").value = periodo.porcentajeContribucion * 100 || 0;
  document.getElementById("per-costo").value = periodo.costoUnitario || 0;
  document.getElementById("per-fecha-inicio").value = periodo.fechaInicio || "";
  document.getElementById("per-fecha-fin").value = periodo.fechaFin || "";

  openModal("modal-periodo");
}

function eliminarPeriodo(id) {
  Swal.fire({
    title: "¿Eliminar periodo?",
    text: "Esta acción también eliminará todos los consumos asociados",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit("delete-periodo", id);
      Swal.fire({
        icon: "success",
        title: "Periodo eliminado",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

// ==================== CONSUMOS ====================

socket.on("consumos", (data) => {
  consumos = data;
  setTimeout(() => {
    aplicarFiltrosConsumos();
    refrescarTodasLasTablas();
  }, 50);
});

socket.on("error-consumo", (mensaje) => {
  Swal.fire({
    icon: "error",
    title: "Error",
    text: mensaje,
  });
});

socket.on("save-consumo-success", () => {
  Swal.fire({
    icon: "success",
    title: "Consumo guardado",
    timer: 1500,
    showConfirmButton: false,
  });
});

function aplicarFiltrosConsumos() {
  const filtroPeriodo = document.getElementById("filtro-periodo-consumo").value;
  const filtroCodigo = document.getElementById("filtro-codigo").value.toLowerCase();
  const filtroBodega = document.getElementById("filtro-bodega").value.toLowerCase();
  const filtroLocal = document.getElementById("filtro-local").value.toLowerCase();
  const filtroCliente = document.getElementById("filtro-cliente").value.toLowerCase();
  const filtroEstado = document.getElementById("filtro-estado").value;

  const consumosFiltrados = consumos.filter((c) => {
    return (
      (!filtroPeriodo || c.periodoId === filtroPeriodo) &&
      (!filtroCodigo || (c.codigo || "").toLowerCase().includes(filtroCodigo)) &&
      (!filtroBodega || (c.bodega || "").toLowerCase().includes(filtroBodega)) &&
      (!filtroLocal || (c.local || "").toLowerCase().includes(filtroLocal)) &&
      (!filtroCliente || (c.clienteNombre || "").toLowerCase().includes(filtroCliente)) &&
      (!filtroEstado || c.estado === filtroEstado)
    );
  });

  renderConsumos(consumosFiltrados);
}

function renderConsumos(consumosFiltrados = consumos) {
  const { items, totalPaginas, totalRegistros } = obtenerDatosPaginados(consumosFiltrados, paginasActuales.consumos);
  const tbody = document.getElementById("lista-consumos");
  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-8 text-center text-slate-500 italic">No hay consumos registrados para los filtros seleccionados</td></tr>`;
  } else {
    items.forEach((consumo) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 transition-all border-b border-slate-100";
      const estadoBadge = consumo.estado === "Ocupado" ? '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Ocupado</span>' : '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Desocupado</span>';

      tr.innerHTML = `
        <td class="px-4 py-3 font-medium text-slate-900">${consumo.periodoNombre || ""}</td>
        <td class="px-4 py-3 text-slate-600">${consumo.codigo || ""}</td>
        <td class="px-4 py-3 text-slate-600">${consumo.bodega || ""}</td>
        <td class="px-4 py-3 text-slate-600">${consumo.local || ""}</td>
        <td class="px-4 py-3 text-slate-900 font-medium">${consumo.clienteNombre || ""}</td>
        <td class="px-4 py-3">${estadoBadge}</td>
        <td class="px-4 py-3 text-slate-900 font-semibold">${(consumo.lecturaActual || 0).toFixed(2)}</td>
        <td class="px-4 py-3 text-slate-900 font-semibold">${(consumo.consumoKwh || 0).toFixed(2)}</td>
        <td class="px-4 py-3 text-green-600 font-bold">${formatCOP(consumo.valorFacturado)}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="editarConsumo('${consumo.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Editar"><i class="fas fa-edit"></i></button>
          <button onclick="eliminarConsumo('${consumo.id}')" class="text-red-600 hover:text-red-800" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Importante: Actualizar controles de paginación de consumos (faltaba en tu código original)
  renderizarControlesPaginacion("consumos", totalPaginas, paginasActuales.consumos, () => aplicarFiltrosConsumos());
}

// Event listeners para filtros
document.getElementById("filtro-periodo-consumo").addEventListener("change", aplicarFiltrosConsumos);
document.getElementById("filtro-codigo").addEventListener("input", aplicarFiltrosConsumos);
document.getElementById("filtro-bodega").addEventListener("input", aplicarFiltrosConsumos);
document.getElementById("filtro-local").addEventListener("input", aplicarFiltrosConsumos);
document.getElementById("filtro-cliente").addEventListener("input", aplicarFiltrosConsumos);
document.getElementById("filtro-estado").addEventListener("change", aplicarFiltrosConsumos);

// Autocompletar datos del cliente al ingresar código
document.getElementById("con-codigo").addEventListener("change", (e) => {
  const codigo = e.target.value;
  const cliente = clientes.find((c) => c.codigo === codigo);

  if (cliente) {
    document.getElementById("con-bodega").value = cliente.bodega || "";
    document.getElementById("con-local").value = cliente.local || "";
    document.getElementById("con-cliente").value = cliente.nombre || "";
    document.getElementById("con-estado").value = cliente.estado || "";

    // Traer lectura anterior automáticamente
    const consumosCliente = consumos
      .filter((c) => c.codigo === codigo)
      .sort((a, b) => {
        return new Date(b.periodoNombre) - new Date(a.periodoNombre);
      });

    if (consumosCliente.length > 0) {
      document.getElementById("con-lectura-anterior").value = consumosCliente[0].lecturaActual || 0;
    }
  } else {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "El código de cliente no existe",
    });
    e.target.value = "";
    document.getElementById("con-bodega").value = "";
    document.getElementById("con-local").value = "";
    document.getElementById("con-cliente").value = "";
    document.getElementById("con-estado").value = "";
  }
});
document.getElementById("form-consumo").addEventListener("submit", (e) => {
  e.preventDefault();
  guardarConsumo(false); // false = cerrar modal después de guardar
});

function guardarConsumo(mantenerAbierto = false) {
  const lecturaAnterior = parseFloat(document.getElementById("con-lectura-anterior").value) || 0;
  const lecturaActual = parseFloat(document.getElementById("con-lectura-actual").value) || 0;

  // Validación: lectura anterior <= lectura actual
  if (lecturaAnterior > lecturaActual) {
    Swal.fire({
      icon: "error",
      title: "Error de validación",
      text: "La lectura anterior debe ser menor o igual a la lectura actual",
    });
    return;
  }

  const consumo = {
    id: document.getElementById("consumo-id").value || Date.now().toString(),
    periodoId: document.getElementById("con-periodo").value,
    codigo: document.getElementById("con-codigo").value,
    lecturaAnterior: lecturaAnterior,
    lecturaActual: lecturaActual,
    impuestoSeguridad: parseFloat(document.getElementById("con-impuesto").value) || 0,
    otrosConceptos: parseFloat(document.getElementById("con-otros").value) || 0,
    ajustarMultiplo10: document.getElementById("con-ajustar-multiplo")?.checked || false,
  };

  // Validar que no exista un consumo con mismo código y periodo (excepto al editar)
  const consumoExistente = consumos.find((c) => c.codigo === consumo.codigo && c.periodoId === consumo.periodoId && c.id !== consumo.id);

  if (consumoExistente) {
    Swal.fire({
      icon: "error",
      title: "Consumo duplicado",
      text: "Ya se ha ingresado un consumo para este código en este periodo.",
    });
    return;
  }

  socket.emit("save-consumo", consumo);

  if (mantenerAbierto) {
    // Limpiar el formulario pero mantener el periodo seleccionado
    const periodoActual = document.getElementById("con-periodo").value;
    document.getElementById("form-consumo").reset();
    document.getElementById("consumo-id").value = "";
    document.getElementById("con-bodega").value = "";
    document.getElementById("con-local").value = "";
    document.getElementById("con-cliente").value = "";
    document.getElementById("con-estado").value = "";

    // Restaurar el periodo y el checkbox
    document.getElementById("con-periodo").value = periodoActual;
    const checkboxMultiplo = document.getElementById("con-ajustar-multiplo");
    if (checkboxMultiplo) {
      checkboxMultiplo.checked = true;
    }

    // Enfocar el campo de código para agilizar el siguiente registro
    document.getElementById("con-codigo").focus();

    Swal.fire({
      icon: "success",
      title: "Consumo guardado",
      text: "Puede registrar otro consumo",
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: "top-end",
    });
  } else {
    closeModal("modal-consumo");
    document.getElementById("form-consumo").reset();

    Swal.fire({
      icon: "success",
      title: "Consumo guardado",
      timer: 1500,
      showConfirmButton: false,
    });
  }

  // Mantener filtros aplicados después de guardar
  setTimeout(() => aplicarFiltrosConsumos(), 200);
}

function guardarYRegistrarOtro() {
  guardarConsumo(true); // true = mantener modal abierto
}

function editarConsumo(id) {
  const consumo = consumos.find((c) => c.id === id);
  if (!consumo) return;

  document.getElementById("consumo-id").value = consumo.id;
  document.getElementById("con-periodo").value = consumo.periodoId || "";
  document.getElementById("con-codigo").value = consumo.codigo || "";
  document.getElementById("con-bodega").value = consumo.bodega || "";
  document.getElementById("con-local").value = consumo.local || "";
  document.getElementById("con-cliente").value = consumo.clienteNombre || "";
  document.getElementById("con-estado").value = consumo.estado || "";
  document.getElementById("con-lectura-anterior").value = consumo.lecturaAnterior || 0;
  document.getElementById("con-lectura-actual").value = consumo.lecturaActual || 0;
  document.getElementById("con-impuesto").value = consumo.impuestoSeguridad || 0;
  document.getElementById("con-otros").value = consumo.otrosConceptos || 0;

  openModal("modal-consumo");
}

function eliminarConsumo(id) {
  Swal.fire({
    title: "¿Eliminar consumo?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit("delete-consumo", id);
      Swal.fire({
        icon: "success",
        title: "Consumo eliminado",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

// GRUPOS DE FACTURACIÓN
socket.on("grupos", (data) => {
  grupos = data;
  renderGrupos();
});

function renderGrupos(gruposFiltrados = grupos) {
  const tbody = document.getElementById("tabla-grupos-body");
  tbody.innerHTML = "";
  gruposFiltrados.forEach((g) => {
    tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4">${g.periodoNombre}</td>
                <td class="p-4">${g.titulo}</td>
                <td class="p-4">${g.clientes.length} clientes</td>
                <td class="p-4">${g.totalConsumo.toFixed(2)} kWh</td>
                <td class="p-4 text-green-600 font-bold">${formatCOP(g.totalFacturado)}</td>
                <td class="p-4 space-x-2">
                    <button onclick="editarGrupo('${g.id}')" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                    <button onclick="eliminarGrupo('${g.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                    <button onclick="generarPDFGrupo('${g.id}')" class="text-purple-600 hover:text-green-800"><i class="fas fa-file-pdf"></i></button>
                </td>
            </tr>
        `;
  });
}

// 1. Capturar el cambio en el selector de periodo
document.getElementById("filtro-grupos").addEventListener("change", function () {
  const selectedPeriod = this.value;
  filterBillingGroupsByPeriod(selectedPeriod);
});

// 2. Función para filtrar los grupos por periodo
function filterBillingGroupsByPeriod(period) {
  if (!period) {
    // Si no hay periodo seleccionado, mostrar todos
    renderGrupos();
    return;
  }

  // Filtrar los grupos cuyo periodoId coincida con el seleccionado
  const filteredGroups = grupos.filter((group) => group.periodoId === period);
  renderGrupos(filteredGroups);
}

// Lógica para agregar clientes a la lista temporal del grupo
function agregarClienteAGrupo() {
  const input = document.getElementById("buscar-cliente-grupo");
  const valor = input.value.trim();
  const periodoId = document.getElementById("grupo-periodo").value;

  if (!periodoId) return Swal.fire("Error", "Seleccione un periodo primero", "error");

  // Buscar el consumo de ese cliente en ese periodo
  const consumoData = consumos.find((c) => (c.codigo === valor || c.clienteNombre === valor) && c.periodoId === periodoId);

  if (!consumoData) {
    return Swal.fire("No encontrado", "No hay registros de consumo para este cliente en el periodo seleccionado", "warning");
  }

  if (clientesTemporalesGrupo.some((c) => c.codigo === consumoData.codigo)) {
    return Swal.fire("Duplicado", "El cliente ya está en el grupo", "info");
  }

  clientesTemporalesGrupo.push(consumoData);
  input.value = "";
  actualizarTablaClientesGrupo();
}

function actualizarTablaClientesGrupo() {
  const tbody = document.getElementById("lista-clientes-grupo-body");
  tbody.innerHTML = "";
  let totalC = 0;
  let totalF = 0;

  clientesTemporalesGrupo.forEach((c, index) => {
    totalC += c.consumoKwh;
    totalF += c.valorFacturado;
    tbody.innerHTML += `
            <tr>
                <td class="w-24">${c.codigo}</td>
                <td class="w-64">${c.clienteNombre}</td>
                <td class="w-64">${c.consumoKwh.toFixed(2)}</td>
                <td class="w-32">${formatCOP(c.valorFacturado)}</td>
                <td class="w-24 text-center">
                    <button type="button" onclick="quitarClienteDeGrupo(${index})" class="text-red-600 hover:text-red-800 mr-3"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
  });

  document.getElementById("total-consumo-grupo").innerText = totalC.toFixed(2);
  document.getElementById("total-facturado-grupo").innerText = formatCOP(totalF);
}

function quitarClienteDeGrupo(index) {
  clientesTemporalesGrupo.splice(index, 1);
  actualizarTablaClientesGrupo();
}

// Guardar el grupo
document.getElementById("form-grupo").onsubmit = (e) => {
  e.preventDefault();
  if (clientesTemporalesGrupo.length === 0) return Swal.fire("Error", "Agregue al menos un cliente", "error");

  const periodoSelect = document.getElementById("grupo-periodo");
  const grupo = {
    id: document.getElementById("grupo-id").value || Date.now().toString(),
    titulo: document.getElementById("grupo-titulo-input").value,
    periodoId: periodoSelect.value,
    periodoNombre: periodoSelect.options[periodoSelect.selectedIndex].text,
    clientes: clientesTemporalesGrupo,
    totalConsumo: clientesTemporalesGrupo.reduce((sum, c) => sum + c.consumoKwh, 0),
    totalFacturado: clientesTemporalesGrupo.reduce((sum, c) => sum + c.valorFacturado, 0),
  };

  socket.emit("save-grupo", grupo);
  closeModal("modal-grupo");
  Swal.fire("Guardado", "Grupo de facturación guardado con éxito", "success");
};

function editarGrupo(id) {
  const grupo = grupos.find((g) => g.id === id);
  if (!grupo) return Swal.fire("Error", "Grupo no encontrado", "error");

  // Rellenar formulario con datos del grupo
  document.getElementById("grupo-id").value = grupo.id;
  document.getElementById("grupo-titulo-input").value = grupo.titulo;
  document.getElementById("grupo-periodo").value = grupo.periodoId;

  // Copiar clientes al arreglo temporal
  clientesTemporalesGrupo = [...grupo.clientes];
  actualizarTablaClientesGrupo();

  openModal("modal-grupo");
}

function eliminarGrupo(id) {
  Swal.fire({
    title: "¿Estás seguro?",
    text: "Esta acción eliminará el grupo permanentemente.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit("delete-grupo", id);
      Swal.fire("Eliminado", "El grupo ha sido eliminado.", "success");
    }
  });
}

// Generar PDF de Grupos de Facturación

async function generarPDFGrupo(id) {
  const grupo = grupos.find((g) => g.id === id);
  if (!grupo) {
    return Swal.fire("Error", "Grupo no encontrado", "error");
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = 15;

    // --- Configuración de Estilos ---
    const theme = {
      primary: [33, 37, 41],
      secondary: [108, 117, 125],
      accent: [0, 90, 40],
      lightGray: [245, 245, 245],
      darkGray: [52, 73, 94],
      border: [200, 200, 200],
      font: "helvetica",
    };

    // --- 1. Cabecera ---
    const loadImage = () => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = "src/granabastos-logo.png";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    const img = await loadImage();
    if (img) {
      doc.addImage(img, "PNG", margin, y, 45, 13.5);
    }

    y += 25;
    doc.setFont(theme.font, "bold");
    doc.setFontSize(16);
    doc.setTextColor(...theme.primary);
    doc.text("RELACIÓN DE FACTURAS - " + grupo.titulo.toUpperCase(), margin, y);

    y += 8;

    doc.setFontSize(10);
    doc.setFont(theme.font, "normal");
    doc.setTextColor(...theme.secondary);
    doc.text("Periodo de Facturación: " + grupo.periodoNombre, pageWidth / 2, y, { align: "center" });

    // --- 2. Tabla de Clientes ---
    const tableData = grupo.clientes.map((cliente, index) => [(index + 1).toString(), cliente.codigo || "", cliente.bodega || "", cliente.local || "", cliente.clienteNombre || "", (cliente.consumoKwh || 0).toFixed(2), formatCOP(cliente.valorFacturado || 0)]);

    // Calcular ancho total de la tabla
    const columnWidths = [8, 16, 16, 16, 55, 22, 27]; // Anchos de cada columna
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const tableMarginLeft = (pageWidth - tableWidth) / 2; // Centrar la tabla

    doc.autoTable({
      startY: y + 10,
      head: [["#", "Código", "Bodega", "Local", "Cliente", "Consumo [kWh]", "Valor Facturado [COP]"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [100, 100, 100],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
      },
      footStyles: {
        fillColor: [52, 73, 94],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" }, // #
        1: { cellWidth: 16, halign: "center" }, // Código
        2: { cellWidth: 16, halign: "center" }, // Bodega
        3: { cellWidth: 16, halign: "center" }, // Local
        4: { cellWidth: 55, halign: "left" }, // Cliente
        5: { cellWidth: 22, halign: "center" }, // Consumo (CENTRADO)
        6: { cellWidth: 27, halign: "center" }, // Valor Facturado (CENTRADO)
      },
      margin: { left: tableMarginLeft, right: tableMarginLeft },
      styles: {
        overflow: "linebreak",
        cellWidth: "wrap",
      },
      // Agregar fila de totales al final de la tabla
      foot: [["", "", "", "", "TOTALES", (grupo.totalConsumo || 0).toFixed(2), formatCOP(grupo.totalFacturado || 0)]],
    });

    // ========== PIE DE PÁGINA ==========
    const footerY = pageHeight - 15;

    doc.setDrawColor(...theme.border);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    doc.setFontSize(7);
    doc.setTextColor(...theme.secondary);
    const fechaGen = new Date().toLocaleString();
    doc.text("Granabastos S.A. - Sistema de Gestión Energética", margin, footerY);
    doc.text(`Generado: ${fechaGen}`, pageWidth - margin, footerY, { align: "right" });

    // Guardar
    doc.save(`Relacion_Facturas_${grupo.titulo.replace(/\s+/g, "_")}_${grupo.periodoNombre}.pdf`);
    Swal.close();
  } catch (error) {
    console.error(error);
    Swal.fire("Error", "Ocurrió un problema al generar el PDF", "error");
  }
}

// ==================== PRORRATEOS ====================

socket.on("prorrateos", (data) => {
  prorrateos = data;
  renderProrrateos();
});

socket.on("error-prorrateo", (mensaje) => {
  Swal.fire({
    icon: "error",
    title: "Error",
    text: mensaje,
  });
});

function renderProrrateos() {
  const { items, totalPaginas, totalRegistros } = obtenerDatosPaginados(prorrateos, paginasActuales.prorrateos);
  const tbody = document.getElementById("lista-prorrateos");
  tbody.innerHTML = "";

  items.forEach((prorrateo) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-all";

    // Determinar qué valor de CU mostrar
    const cuToShow = prorrateo.cuManual || prorrateo.costoUnitario || 0;

    tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-slate-900">${prorrateo.codigo || ""}</td>
            <td class="px-4 py-3 text-slate-600">${prorrateo.bodega || ""}</td>
            <td class="px-4 py-3 text-slate-600">${prorrateo.local || ""}</td>
            <td class="px-4 py-3 text-slate-900 font-medium">${prorrateo.clienteNombre || ""}</td>
            <td class="px-4 py-3 text-slate-600">${prorrateo.fechaInicio || ""}</td>
            <td class="px-4 py-3 text-slate-600">${prorrateo.fechaEntrega || ""}</td>
            <td class="px-4 py-3 text-slate-600">${(prorrateo.lecturaAnterior || 0).toFixed(2)}</td>
            <td class="px-4 py-3 text-slate-900 font-semibold">${(prorrateo.lecturaActual || 0).toFixed(2)}</td>
            <td class="px-4 py-3 text-slate-600">${((prorrateo.contribucionManual !== undefined ? prorrateo.contribucionManual * 1 : prorrateo.porcentajeContribucion * 100) || 0).toFixed(2)}%</td>
            <td class="px-4 py-3 text-slate-600">${formatCOP(cuToShow)}</td>
            <td class="px-4 py-3 text-green-600 font-bold">${formatCOP(prorrateo.valorProrrateado)}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="editarProrrateo('${prorrateo.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="eliminarProrrateo('${prorrateo.id}')" class="text-red-600 hover:text-red-800 mr-3" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
                <button onclick="generarPDFProrrateo('${prorrateo.id}')" class="text-purple-600 hover:text-purple-800" title="Generar PDF">
                    <i class="fas fa-file-pdf"></i>
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  // Actualizar info y controles
  renderizarControlesPaginacion("prorrateos", totalPaginas, paginasActuales.prorrateos, () => renderProrrateos());
}

// Autocompletar datos del cliente al ingresar código en prorrateo
document.getElementById("pro-codigo").addEventListener("change", (e) => {
  const codigo = e.target.value;
  const cliente = clientes.find((c) => c.codigo === codigo);

  if (cliente) {
    // Traer lectura anterior automáticamente
    const consumosCliente = consumos
      .filter((c) => c.codigo === codigo)
      .sort((a, b) => {
        return new Date(b.periodoNombre) - new Date(a.periodoNombre);
      });

    if (consumosCliente.length > 0) {
      document.getElementById("pro-lectura-anterior").value = consumosCliente[0].lecturaActual || 0;
    }

    // Asignar fecha de inicio por defecto (última fecha límite del último periodo)
    if (periodos.length > 0) {
      const ultimoPeriodo = periodos[periodos.length - 1];
      document.getElementById("pro-fecha-inicio").value = ultimoPeriodo.fechaFin || "";
    }
  } else {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "El código de cliente no existe",
    });
    e.target.value = "";
  }
});

document.getElementById("form-prorrateo").addEventListener("submit", (e) => {
  e.preventDefault();

  const lecturaAnterior = parseFloat(document.getElementById("pro-lectura-anterior").value) || 0;
  const lecturaActual = parseFloat(document.getElementById("pro-lectura-actual").value) || 0;

  // Validación: lectura anterior <= lectura actual
  if (lecturaAnterior > lecturaActual) {
    Swal.fire({
      icon: "error",
      title: "Error de validación",
      text: "La lectura anterior debe ser menor o igual a la lectura actual",
    });
    return; // Detener el envío
  }

  const fechaInicio = document.getElementById("pro-fecha-inicio").value;
  const fechaEntrega = document.getElementById("pro-fecha-entrega").value;

  // Validación: Fecha Inicio <= Fecha Entrega
  if (new Date(fechaInicio) > new Date(fechaEntrega)) {
    Swal.fire({
      icon: "error",
      title: "Error en fechas",
      text: "La fecha de inicio no puede ser posterior a la fecha de entrega",
    });
    return;
  }

  // Obtener valores manuales si están presentes
  const cuManual = document.getElementById("pro-cu-manual").value;
  const contribucionManual = document.getElementById("pro-contribucion-manual").value;

  const prorrateo = {
    id: document.getElementById("prorrateo-id").value || Date.now().toString(),
    codigo: document.getElementById("pro-codigo").value,
    fechaInicio: document.getElementById("pro-fecha-inicio").value,
    fechaEntrega: document.getElementById("pro-fecha-entrega").value,
    lecturaAnterior: parseFloat(document.getElementById("pro-lectura-anterior").value) || 0,
    lecturaActual: parseFloat(document.getElementById("pro-lectura-actual").value) || 0,
    impuestoSeguridad: parseFloat(document.getElementById("pro-impuesto").value) || 0,
    otrosConceptos: parseFloat(document.getElementById("pro-otros").value) || 0,
    // Agregar los valores manuales si están presentes
    ...(cuManual && { cuManual: parseFloat(cuManual) }),
    ...(contribucionManual && { contribucionManual: parseFloat(contribucionManual) }),
  };

  socket.emit("save-prorrateo", prorrateo);
  closeModal("modal-prorrateo");
  document.getElementById("form-prorrateo").reset();
  document.getElementById("prorrateo-id").value = "";
  document.getElementById("pro-cu-manual").value = "";
  document.getElementById("pro-contribucion-manual").value = "";

  Swal.fire({
    icon: "success",
    title: "Prorrateo guardado",
    timer: 1500,
    showConfirmButton: false,
  });
});

function editarProrrateo(id) {
  const prorrateo = prorrateos.find((p) => p.id === id);
  if (!prorrateo) return;

  document.getElementById("prorrateo-id").value = prorrateo.id;
  document.getElementById("pro-codigo").value = prorrateo.codigo || "";
  document.getElementById("pro-fecha-inicio").value = prorrateo.fechaInicio || "";
  document.getElementById("pro-fecha-entrega").value = prorrateo.fechaEntrega || "";
  document.getElementById("pro-lectura-anterior").value = prorrateo.lecturaAnterior || 0;
  document.getElementById("pro-lectura-actual").value = prorrateo.lecturaActual || 0;
  document.getElementById("pro-impuesto").value = prorrateo.impuestoSeguridad || 0;
  document.getElementById("pro-otros").value = prorrateo.otrosConceptos || 0;

  // Cargar valores manuales si existen
  if (prorrateo.cuManual) {
    document.getElementById("pro-cu-manual").value = prorrateo.cuManual;
  }
  if (prorrateo.contribucionManual) {
    document.getElementById("pro-contribucion-manual").value = prorrateo.contribucionManual;
  }

  openModal("modal-prorrateo");
}

function eliminarProrrateo(id) {
  Swal.fire({
    title: "¿Eliminar prorrateo?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit("delete-prorrateo", id);
      Swal.fire({
        icon: "success",
        title: "Prorrateo eliminado",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

async function generarPDFProrrateo(id) {
  const prorrateo = prorrateos.find((p) => p.id === id);
  if (!prorrateo) return;

  Swal.fire({
    title: "Generando documento...",
    text: "Preparando diseño profesional",
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20; // Margen más amplio para elegancia
    let y = 15;

    // --- Configuración de Estilos ---
    const theme = {
      primary: [33, 37, 41], // Casi negro para texto principal
      secondary: [108, 117, 125], // Gris para etiquetas
      accent: [0, 90, 40], // Verde Granabastos
      lightGray: [245, 245, 245],
      border: [200, 200, 200],
      font: "helvetica",
    };

    // Helper para textos con jerarquía
    const drawField = (label, value, x, yPos, labelWidth = 25) => {
      doc.setFont(theme.font, "bold");
      doc.setTextColor(...theme.secondary);
      doc.text(label, x, yPos);
      doc.setFont(theme.font, "normal");
      doc.setTextColor(...theme.primary);
      doc.text(String(value), x + labelWidth, yPos);
    };

    const drawSectionHeader = (title, yPos) => {
      doc.setDrawColor(...theme.accent);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos); // Línea superior sutil

      doc.setFillColor(...theme.lightGray);
      doc.rect(margin, yPos + 1, pageWidth - margin * 2, 7, "F");

      doc.setFont(theme.font, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...theme.accent);
      doc.text(title.toUpperCase(), margin + 3, yPos + 6);
      return yPos + 15;
    };

    const loadImage = (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });

    // --- 1. Cabecera ---
    const [logoR, logoG] = await Promise.all([loadImage("src/ruitoque-logo.png"), loadImage("src/granabastos-logo.png")]);

    if (logoR) doc.addImage(logoR, "PNG", margin, y, 45, 13.5);
    if (logoG) doc.addImage(logoG, "PNG", pageWidth - margin - 45, y, 45, 13.5);

    y += 25;
    doc.setFont(theme.font, "bold");
    doc.setFontSize(18);
    doc.setTextColor(...theme.primary);
    doc.text("INFORME DE PRORRATEO", margin, y);

    doc.setFontSize(10);
    doc.setFont(theme.font, "normal");
    doc.setTextColor(...theme.secondary);
    doc.text(`No. Documento: PR-${prorrateo.codigo}-${prorrateo.id}`, pageWidth - margin, y, { align: "right" });

    y += 10;

    // --- 2. Datos del Cliente (Layout en Columnas) ---
    y = drawSectionHeader("Información del Cliente", y);
    doc.setFontSize(9);

    drawField("Cliente:", prorrateo.clienteNombre, margin + 3, y);
    drawField("Bodega:", prorrateo.bodega, pageWidth / 2 + 10, y);
    y += 6;
    drawField("NIT/CC:", prorrateo.nit || "N/A", margin + 3, y);
    drawField("Local:", prorrateo.local, pageWidth / 2 + 10, y);
    y += 6;
    drawField("Teléfono:", prorrateo.telefono || "N/A", margin + 3, y);
    drawField("Periodo:", `${prorrateo.fechaInicio} - ${prorrateo.fechaEntrega}`, pageWidth / 2 + 10, y);

    y += 12;

    // --- 3. Detalles Técnicos y Consumo ---
    y = drawSectionHeader("Detalle de Consumo y Tarifas", y);

    // Cuadro de resumen técnico
    doc.setDrawColor(...theme.border);
    doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 20, 1, 1, "S");

    const colW = (pageWidth - margin * 2) / 3;

    // Columna 1: Lecturas
    doc.setFont(theme.font, "bold");
    doc.text("Lecturas (kWh)", margin + 5, y);
    doc.setFont(theme.font, "normal");
    doc.text(`Anterior: ${prorrateo.lecturaAnterior.toFixed(2)}`, margin + 5, y + 5);
    doc.text(`Actual: ${prorrateo.lecturaActual.toFixed(2)}`, margin + 5, y + 10);

    // Columna 2: Consumo Base
    doc.setFont(theme.font, "bold");
    doc.text("Consumo Base", margin + colW + 5, y);
    doc.setFont(theme.font, "normal");
    doc.text(`${prorrateo.consumoKwh.toFixed(2)} kWh`, margin + colW + 5, y + 5);
    doc.text(`${prorrateo.diasFacturados} Días`, margin + colW + 5, y + 10);

    // Columna 3: Costos
    doc.setFont(theme.font, "bold");
    doc.text("Tarifa Aplicada", margin + colW * 2 + 5, y);
    doc.setFont(theme.font, "normal");
    doc.text(`CU: ${formatCOP(prorrateo.costoUnitario)}`, margin + colW * 2 + 5, y + 5);
    doc.text(`Contribución: ${(prorrateo.porcentajeContribucion * 100).toFixed(1)}%`, margin + colW * 2 + 5, y + 10);

    y += 25;

    // --- 4. Tabla de Liquidación ---
    y = drawSectionHeader("Liquidación de Valores", y);

    const items = [
      { desc: "Valor Energía Base", val: prorrateo.consumoKwh * prorrateo.costoUnitario },
      { desc: "Contribución", val: prorrateo.porcentajeContribucion * prorrateo.consumoKwh * prorrateo.costoUnitario },
      { desc: "Impuesto de Seguridad", val: prorrateo.impuestoParcial },
      { desc: "Otros Conceptos y Ajustes", val: prorrateo.otrosConceptos },
    ];

    doc.setFontSize(9);
    items.forEach((item) => {
      doc.setFont(theme.font, "normal");
      doc.setTextColor(...theme.primary);
      doc.text(item.desc, margin + 3, y);
      doc.text(formatCOP(item.val), pageWidth - margin - 3, y, { align: "right" });

      doc.setDrawColor(...theme.lightGray);
      doc.line(margin + 3, y + 2, pageWidth - margin - 3, y + 2);
      y += 8;
    });

    // --- 5. Total Destacado ---
    y += 5;
    doc.setFillColor(...theme.accent);
    doc.roundedRect(pageWidth - margin - 80, y, 80, 14, 1, 1, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont(theme.font, "bold");
    doc.setFontSize(11);
    doc.text("TOTAL NETO A PAGAR", pageWidth - margin - 5, y + 5, { align: "right" });
    doc.setFontSize(15);
    doc.text(formatCOP(prorrateo.valorProrrateado), pageWidth - margin - 5, y + 12, { align: "right" });

    // --- 6. Observaciones ---
    y += 30;
    doc.setFont(theme.font, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...theme.accent);
    doc.text("NOTAS Y OBSERVACIONES", margin, y);

    y += 5;
    doc.setFont(theme.font, "normal");
    doc.setTextColor(...theme.secondary);
    const obsText = `- Este documento es un soporte de liquidación interna. No hace las veces de una factura electrónica.\n- El periodo facturado comprende del ${prorrateo.fechaInicio} al ${prorrateo.fechaEntrega}.\n- Para cualquier aclaración, por favor contactar al departamento de mantenimiento o al correo proyectos@granabastos.com.co.`;
    const splitObs = doc.splitTextToSize(obsText, pageWidth - margin * 2);
    doc.text(splitObs, margin, y);

    // --- 7. Pie de Página Fijo ---
    const footerY = doc.internal.pageSize.height - 20;
    doc.setDrawColor(...theme.border);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFontSize(7);
    doc.setTextColor(...theme.secondary);
    const fechaGen = new Date().toLocaleString();
    doc.text("Granabastos S.A. - Sistema de Gestión Energética", margin, footerY + 5);
    doc.text(`Página 1 de 1 | Generado: ${fechaGen}`, pageWidth - margin, footerY + 5, { align: "right" });

    // Guardar
    doc.save(`Factura_Prorrateo_${prorrateo.codigo}.pdf`);
    Swal.close();
  } catch (error) {
    console.error(error);
    Swal.fire("Error", "Ocurrió un problema al generar el PDF profesional.", "error");
  }
}

/* ==============================
   Consulta pública: lógica JS
   ============================== */

let publicChart = null;
let lastPublicConsultaCodigo = null;

// Abrir la consulta desde el botón o Enter
function consultarClientePublico() {
  const codigo = document.getElementById("public-query-code").value.trim();
  if (!codigo) {
    Swal.fire("Atención", "Ingrese un código de cliente", "warning");
    return;
  }

  const cliente = clientes.find((c) => c.codigo === codigo);
  if (!cliente) {
    Swal.fire({
      icon: "error",
      title: "No encontrado",
      text: "No se encontró un cliente con el código proporcionado.",
    });
    return;
  }

  // Guardar el código consultado para referencia en select/change
  lastPublicConsultaCodigo = codigo;

  // Rellenar información del cliente
  document.getElementById("public-codigo").textContent = cliente.codigo || "-";
  document.getElementById("public-nombre").textContent = cliente.nombre || "-";
  document.getElementById("public-bodega").textContent = cliente.bodega || "-";
  document.getElementById("public-local").textContent = cliente.local || "-";
  document.getElementById("public-administrador").textContent = cliente.administrador || "-";
  document.getElementById("public-nit").textContent = cliente.nit || "-";
  document.getElementById("public-telefono").textContent = cliente.telefono || "-";

  // Preparar lista de periodos en el select público (usa periodos global)
  const sel = document.getElementById("public-periodo-select");
  sel.innerHTML = `<option value="">-- Seleccionar periodo --</option>`;
  periodos.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.nombre;
    sel.appendChild(opt);
  });

  // Renderizar gráfico con hasta últimos 6 consumos del cliente
  const consumosCliente = consumos
    .filter((c) => c.codigo === codigo)
    // ordenar por periodoNombre (mejor si periodo tiene fecha, sino por nombre)
    .sort((a, b) => {
      // intentar ordenar por fecha si existe periodoNombre o periodoId; fallback a string
      const da = a.periodoNombre || "";
      const db = b.periodoNombre || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });

  // Tomar los últimos 6 en orden cronológico (si hay más)
  const ultimos = consumosCliente.slice(-6);
  renderPublicConsumosChart(ultimos);

  // Limpiar detalle de facturación y prorrateos
  document.getElementById("public-facturacion-detalle").innerHTML = `<div class="text-slate-500">Seleccione un periodo para ver el detalle de facturación.</div>`;
  document.getElementById("public-prorrateos-list").innerHTML = "";

  openModal("modal-publico");
}

// Renderiza el gráfico con Chart.js
function renderPublicConsumosChart(consumosArray) {
  const ctx = document.getElementById("chart-consumos-publico").getContext("2d");

  // Preparar datos para el chart
  if (!consumosArray || consumosArray.length === 0) {
    // Si no hay consumos, limpiar y mostrar mensaje en canvas (usamos overlay simple)
    if (publicChart) {
      publicChart.destroy();
      publicChart = null;
    }
    // dibujar mensaje simple en canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("No hay consumos registrados", ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  const labels = consumosArray.map((c) => c.periodoNombre || c.periodoId || "");
  const data = consumosArray.map((c) => parseFloat(c.consumoKwh || 0));

  // destruir chart previo si existe
  if (publicChart) {
    publicChart.destroy();
    publicChart = null;
  }

  publicChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Consumo (kWh)",
          data,
          backgroundColor: "rgba(59,130,246,0.8)",
          borderColor: "rgba(59,130,246,1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "kWh" },
        },
        x: {
          title: { display: true, text: "Periodo" },
        },
      },
    },
  });
}

// Actualizar detalle de facturación cuando se selecciona un periodo
function actualizarFacturacionPublica() {
  const periodoId = document.getElementById("public-periodo-select").value;
  const detalleDiv = document.getElementById("public-facturacion-detalle");
  const prorrListDiv = document.getElementById("public-prorrateos-list");

  detalleDiv.innerHTML = "";
  prorrListDiv.innerHTML = "";

  if (!periodoId || !lastPublicConsultaCodigo) {
    detalleDiv.innerHTML = `<div class="text-slate-500">Seleccione un periodo para ver el detalle de facturación.</div>`;
    return;
  }

  const periodo = periodos.find((p) => p.id === periodoId);
  const consumo = consumos.find((c) => c.periodoId === periodoId && c.codigo === lastPublicConsultaCodigo);

  // Mostrar detalle de facturación
  if (!consumo) {
    detalleDiv.innerHTML = `<div class="text-red-600 font-semibold">No existe facturación registrada para este periodo y código.</div>`;
  } else {
    let html = `
      <div class="text-sm">
        <div><strong>Periodo:</strong> ${periodo ? periodo.nombre : consumo.periodoNombre || "-"}</div>
        <div><strong>Lectura Anterior:</strong> ${(consumo.lecturaAnterior || 0).toFixed(2)}</div>
        <div><strong>Lectura Actual:</strong> ${(consumo.lecturaActual || 0).toFixed(2)}</div>
        <div><strong>Consumo (kWh):</strong> ${(consumo.consumoKwh || 0).toFixed(2)}</div>
        <div><strong>Valor Facturado:</strong> ${formatCOP(consumo.valorFacturado || 0)}</div>
      </div>
    `;
    detalleDiv.innerHTML = html;
  }

  // Buscar prorrateos que coincidan con el código y que intersecten el rango del periodo
  if (periodo && periodo.fechaInicio && periodo.fechaFin) {
    const pStart = new Date(periodo.fechaInicio);
    const pEnd = new Date(periodo.fechaFin);

    const prorratesCoincidentes = prorrateos.filter((pr) => {
      if (pr.codigo !== lastPublicConsultaCodigo) return false;
      if (!pr.fechaInicio || !pr.fechaEntrega) return false;
      const prStart = new Date(pr.fechaInicio);
      const prEnd = new Date(pr.fechaEntrega);
      // overlap condition
      return prStart <= pEnd && prEnd >= pStart;
    });

    if (prorratesCoincidentes.length === 0) {
      prorrListDiv.innerHTML = `<div class="text-slate-500 mt-2">No hay prorrateos dentro del rango de fechas del periodo seleccionado.</div>`;
    } else {
      // Mostrar botón(s) para generar PDF de cada prorrateo coincidente
      let html = `<div class="mt-2"><strong>Prorrateos encontrados:</strong></div><div class="flex flex-col gap-2 mt-2">`;
      prorratesCoincidentes.forEach((pr) => {
        html += `
          <div class="flex items-center justify-between bg-slate-50 p-2 rounded">
            <div class="text-sm">
              <div><strong>Prorrateo ID:</strong> ${pr.id}</div>
              <div class="text-xs text-slate-500">Rango: ${pr.fechaInicio} → ${pr.fechaEntrega}</div>
            </div>
            <div>
              <button onclick="generarPDFProrrateo('${pr.id}')" class="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                <i class="fas fa-file-pdf mr-2"></i>Descargar PDF
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
      prorrListDiv.innerHTML = html;
    }
  } else {
    prorrListDiv.innerHTML = `<div class="text-slate-500 mt-2">Selecciona un periodo válido para comprobar prorrateos.</div>`;
  }
}

/* Listeners: Enter en input público y cambio de periodo */
document.getElementById("public-query-code").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    consultarClientePublico();
  }
});
document.getElementById("public-periodo-select").addEventListener("change", actualizarFacturacionPublica);

// Lógica para exportar Clientes a Excel
document.getElementById("btn-export-clientes").addEventListener("click", () => {
  if (!clientes || clientes.length === 0) {
    Swal.fire("Sin datos", "No hay clientes registrados para exportar", "warning");
    return;
  }

  // Preparamos los datos con encabezados limpios
  const datosExportar = clientes.map((c) => ({
    Código: c.codigo,
    "Nombre/Razón Social": c.nombre,
    Bodega: c.bodega,
    Local: c.local,
    Administrador: c.administrador,
    NIT: c.nit,
    Teléfono: c.telefono,
    Estado: c.estado === "Ocupado" ? "Activo" : "Inactivo",
  }));

  // Crear el libro de Excel
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datosExportar);

  // Ajustar ancho de columnas automáticamente
  const wscols = [{ wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
  ws["!cols"] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Clientes");

  // Descargar archivo
  XLSX.writeFile(wb, `Reporte_Clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// Lógica corregida para exportar Consumos
document.getElementById("btn-export-consumos").addEventListener("click", () => {
  const periodoId = document.getElementById("filtro-periodo-consumo").value;

  if (!periodoId) {
    Swal.fire("Atención", "Por favor seleccione un periodo para exportar.", "warning");
    return;
  }

  const consumosFiltrados = consumos.filter((c) => c.periodoId === periodoId);

  if (consumosFiltrados.length === 0) {
    Swal.fire("Sin datos", "No hay consumos para el periodo seleccionado.", "info");
    return;
  }

  const periodo = periodos.find((p) => p.id === periodoId);
  const nombrePeriodo = periodo ? periodo.nombre.replace(/\s+/g, "_") : "Periodo";

  const datosExportar = consumosFiltrados.map((c) => ({
    Código: c.codigo,
    Cliente: c.clienteNombre || "N/A",
    Bodega: c.bodega || "",
    Local: c.local || "",
    Periodo: c.periodoNombre || nombrePeriodo,
    "Lectura Anterior": c.lecturaAnterior || 0,
    "Lectura Actual": c.lecturaActual || 0,
    "Consumo (kWh)": c.consumoKwh || 0,
    "Valor Facturado": c.valorFacturado || 0,
  }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosExportar);

    ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];

    XLSX.utils.book_append_sheet(wb, ws, "Consumos");
    XLSX.writeFile(wb, `Consumos_${nombrePeriodo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    console.error("Error exportando Excel:", error);
    Swal.fire("Error", "No se pudo generar el archivo Excel.", "error");
  }
});
