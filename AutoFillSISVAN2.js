// ==UserScript==
// @name         AutoFill SISVAN - Rápido y Reintentos (Mejorado)
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  Autocompleta el formulario SISVAN con datos de CSV y selecciona la institución educativa.
// @match        https://docs.google.com/forms/*1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let datosCSV = null;
    const MAX_INTENTOS = 5;
    const RETRASO_MIN = 300; // Milisegundos entre intentos
    let autoCargarInterval = null;
    let estaAutoCargando = sessionStorage.getItem('autoCargarActivo') === 'true';

    function guardarEstadoAutoCargar(estado) {
        estaAutoCargando = estado;
        sessionStorage.setItem('autoCargarActivo', estado);
    }

    function crearInterfazCarga() {
        const contenedor = document.createElement("div");
        Object.assign(contenedor.style, {
            position: "fixed",
            top: "10px",
            left: "10px",
            backgroundColor: "white",
            padding: "15px",
            borderRadius: "8px",
            boxShadow: "0px 0px 10px rgba(0,0,0,0.2)",
            zIndex: "10000",
            fontFamily: "Arial, sans-serif",
            width: "300px"
        });

        const titulo = document.createElement("h4");
        titulo.innerText = "Autocompletar SISVAN";
        Object.assign(titulo.style, {
            margin: "0 0 10px 0",
            color: "#333",
            textAlign: "center"
        });

        const inputTexto = document.createElement("textarea");
        Object.assign(inputTexto, {
            placeholder: "Nombre,Cedula,Fecha (dia/mes/año),Municipio,Parroquia,Institución",
            rows: 3,
            cols: 40,
            width: "100%",
            padding: "8px",
            marginBottom: "10px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px"
        });
        inputTexto.value = localStorage.getItem("datosCSV") || "";

        const botonCargar = document.createElement("button");
        botonCargar.innerText = "Cargar Datos";
        Object.assign(botonCargar.style, {
            width: "100%",
            padding: "8px",
            margin: "5px 0",
            backgroundColor: "#4285f4",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
        });

        const botonAutoCargar = document.createElement("button");
        botonAutoCargar.innerText = estaAutoCargando ? "Detener Auto Carga" : "Auto Cargar (1s)";
        Object.assign(botonAutoCargar.style, {
            width: "100%",
            padding: "8px",
            margin: "5px 0",
            backgroundColor: estaAutoCargando ? "#ea4335" : "#34a853",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
        });

        // Efectos hover
        botonCargar.addEventListener("mouseover", () => botonCargar.style.backgroundColor = "#3367d6");
        botonCargar.addEventListener("mouseout", () => botonCargar.style.backgroundColor = "#4285f4");
        botonAutoCargar.addEventListener("mouseover", () => {
            botonAutoCargar.style.backgroundColor = estaAutoCargando ? "#d33426" : "#2d9246";
        });
        botonAutoCargar.addEventListener("mouseout", () => {
            botonAutoCargar.style.backgroundColor = estaAutoCargando ? "#ea4335" : "#34a853";
        });

        botonCargar.addEventListener("click", () => {
            cargarDatosDesdeCSV(inputTexto.value);
        });

        botonAutoCargar.addEventListener("click", () => {
            const nuevoEstado = !estaAutoCargando;
            guardarEstadoAutoCargar(nuevoEstado);

            if (nuevoEstado) {
                botonAutoCargar.innerText = "Detener Auto Carga";
                botonAutoCargar.style.backgroundColor = "#ea4335";
                autoCargarInterval = setInterval(() => {
                    cargarDatosDesdeCSV(inputTexto.value);
                }, 1000);
            } else {
                botonAutoCargar.innerText = "Auto Cargar (1s)";
                botonAutoCargar.style.backgroundColor = "#34a853";
                clearInterval(autoCargarInterval);
                autoCargarInterval = null;
            }
        });

        contenedor.append(titulo, inputTexto, botonCargar, botonAutoCargar);
        document.body.appendChild(contenedor);

        // Iniciar auto-carga si estaba activo
        if (estaAutoCargando) {
            autoCargarInterval = setInterval(() => {
                cargarDatosDesdeCSV(inputTexto.value);
            }, 1000);
        }
    }

    function cargarDatosDesdeCSV(csvText) {
        const valores = csvText.split(",").map(val => val.trim());
        if (valores.length < 6) {
            console.error("Error: Se requieren al menos 6 valores en el CSV.");
            return;
        }

        localStorage.setItem("datosCSV", csvText);

        datosCSV = {
            nombres_transcriptor: valores[0],
            cedula_transcriptor: valores[1],
            fecha_abordaje: convertirFecha(valores[2]),
            municipio1: valores[3] || "",
            municipio2: valores[4] || "",
            institucion: valores[5] || ""
        };

        llenarPrimeraPagina(datosCSV, 0);
    }

    function convertirFecha(fecha) {
        const [dia, mes, año] = fecha.split(/[-/]/);
        return `${año}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
    }

    function llenarCampo(selector, valor) {
        const campo = document.querySelector(selector);
        if (campo) {
            campo.value = valor;
            ["input", "change", "blur"].forEach(evt => campo.dispatchEvent(new Event(evt, { bubbles: true })));
        }
    }

    function llenarCampoFecha(ariaLabelledby, valor) {
        const campo = document.querySelector(`input[type="date"][aria-labelledby="${ariaLabelledby}"]`);
        if (campo) {
            campo.focus();
            setTimeout(() => llenarCampo(`input[type="date"][aria-labelledby="${ariaLabelledby}"]`, valor), 200);
        }
    }

    function seleccionarOpcionRadio(texto1, texto2) {
        let opcion = document.evaluate(`//div[@role="radio" and @aria-label="${texto1}"]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (!opcion && texto2) {
            console.warn(`No se encontró "${texto1}". Probando con "${texto2}"...`);
            opcion = document.evaluate(`//div[@role="radio" and @aria-label="${texto2}"]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        if (opcion) {
            opcion.click();
        } else {
            console.error(`No se encontró ninguna opción para "${texto1}" ni "${texto2}".`);
        }
    }

    function seleccionarInstitucion(nombreInstitucion) {
        let seleccionada = false;
        document.querySelectorAll('div[role="radio"]').forEach(opcion => {
            if (opcion.getAttribute("aria-label") === nombreInstitucion) {
                opcion.click();
                seleccionada = true;
                console.log(`✔ Institución seleccionada: ${nombreInstitucion}`);
            }
        });

        if (!seleccionada) {
            console.error(`❌ No se encontró la institución: ${nombreInstitucion}`);
        }
    }

    function siguientePagina(intentos = 0, callback) {
        const boton = document.evaluate('//span[text()="Siguiente"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (boton) {
            boton.click();
            console.log(`Intento ${intentos + 1}: Avanzando de página...`);
            setTimeout(() => callback(datosCSV, 0), RETRASO_MIN);
        } else if (intentos < MAX_INTENTOS) {
            console.warn(`Intento ${intentos + 1} fallido. Reintentando...`);
            setTimeout(() => siguientePagina(intentos + 1, callback), RETRASO_MIN);
        } else {
            console.error("No se pudo avanzar después de varios intentos.");
        }
    }

    function llenarPrimeraPagina(datos, intentos) {
        llenarCampo(`input[aria-labelledby="i1 i4"]`, datos.nombres_transcriptor);
        llenarCampo(`input[aria-labelledby="i6 i9"]`, datos.cedula_transcriptor);
        setTimeout(() => siguientePagina(intentos, llenarSegundaPagina), RETRASO_MIN);
    }

    function llenarSegundaPagina(datos, intentos) {
        llenarCampoFecha("i6", datos.fecha_abordaje);
        seleccionarOpcionRadio(datos.municipio1, datos.municipio2);
        setTimeout(() => siguientePagina(intentos, llenarTerceraPagina), RETRASO_MIN);
    }

    function llenarTerceraPagina(datos, intentos) {
        seleccionarInstitucion(datos.institucion);
        setTimeout(() => siguientePagina(intentos, () => console.log("✔ Formulario completado.")), RETRASO_MIN);
    }

    // Limpiar sessionStorage al cerrar la pestaña si no está activo
    window.addEventListener('beforeunload', function() {
        if (!estaAutoCargando) {
            sessionStorage.removeItem('autoCargarActivo');
        }
    });

    crearInterfazCarga();
})();
