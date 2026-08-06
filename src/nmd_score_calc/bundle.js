var NmdScoreCalc = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // scripts/entry.mjs
  var entry_exports = {};
  __export(entry_exports, {
    STAGES: () => STAGES,
    buildMPGKern: () => buildMPGKern,
    calcScaleFactor: () => calcScaleFactor,
    calculateMPG: () => calculateMPG,
    reconcileScaling: () => reconcileScaling
  });

  // ../nmd_bpm_backend/html/js/calculation/matrix.js
  function zeros(rows, cols) {
    return Array.from(
      { length: rows },
      () => Array(cols).fill(0)
    );
  }
  function matMul(A, B) {
    const rowsA = A.length;
    const colsA = A[0].length;
    const rowsB = B.length;
    const colsB = B[0].length;
    if (colsA !== rowsB) {
      throw new Error(
        `Matrix dimensies ongeldig (${rowsA}x${colsA}) \xD7 (${rowsB}x${colsB})`
      );
    }
    const result = zeros(
      rowsA,
      colsB
    );
    for (let i = 0; i < rowsA; i++) {
      for (let k = 0; k < colsA; k++) {
        const value = A[i][k];
        if (value === 0) {
          continue;
        }
        for (let j = 0; j < colsB; j++) {
          result[i][j] += value * B[k][j];
        }
      }
    }
    return result;
  }

  // ../nmd_bpm_backend/html/js/calculation/scaling.js
  var STAGES = [
    "A1-3",
    "A4",
    "A5",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "C1",
    "C2",
    "C3",
    "C4",
    "D"
  ];
  function calcScaleFactor(profile, schalingProfiles) {
    let f = 1;
    if (!Array.isArray(schalingProfiles) || !profile?.scaling?.dimensions) {
      return f;
    }
    for (const scaling of schalingProfiles) {
      if (profile.title !== scaling.profiel) {
        continue;
      }
      const dimensions = profile.scaling.dimensions;
      const xRef = dimensions.map(
        (d) => d.inspected_value
      );
      const xMin = dimensions.map(
        (d) => d.minimum
      );
      const xMax = dimensions.map(
        (d) => d.maximum
      );
      const xSet = [...xRef];
      const dimensies = scaling.dimensies || [];
      for (let i = 0; i < dimensies.length; i++) {
        if (dimensies[i] < xMin[i]) {
          console.warn(
            `Dimensie ${i} voor profiel "${profile.title}" ligt onder de toegestane range (waarde ${dimensies[i]}, minimum ${xMin[i]})`
          );
        }
        if (dimensies[i] > xMax[i]) {
          console.warn(
            `Dimensie ${i} voor profiel "${profile.title}" ligt boven de toegestane range (waarde ${dimensies[i]}, maximum ${xMax[i]})`
          );
        }
        xSet[i] = dimensies[i];
      }
      const xR = xRef.reduce(
        (a, b) => a * b,
        1
      );
      const x = xSet.reduce(
        (a, b) => a * b,
        1
      );
      const params = profile.scaling.parameters;
      let y;
      let yRef;
      switch (profile.scaling.formula) {
        /*
         * y = ax + b
         */
        case "v4_linear":
        case "v3_linear":
          y = params[0] * x + params[1];
          yRef = params[0] * xR + params[1];
          break;
        /*
         * y = ax^3 + bx^2 + cx + d
         */
        case "v4_nonlinear":
          y = params[0] * x ** 3 + params[1] * x ** 2 + params[2] * x + params[3];
          yRef = params[0] * xR ** 3 + params[1] * xR ** 2 + params[2] * xR + params[3];
          break;
        /*
         * y = ax^b + c
         */
        case "v3_power":
          y = params[0] * x ** params[1] + params[2];
          yRef = params[0] * xR ** params[1] + params[2];
          break;
        /*
         * y = a*ln(x) + b
         * (Utilities.py gebruikt hier params[2], niet params[1] —
         * letterlijk overgenomen zoals in de brondata)
         */
        case "v3_logarithmic":
          y = params[0] * Math.log(x) + params[2];
          yRef = params[0] * Math.log(xR) + params[2];
          break;
        /*
         * y = a*exp(bx) + c
         */
        case "v3_exponential":
          y = params[0] * Math.exp(params[1] * x) + params[2];
          yRef = params[0] * Math.exp(params[1] * xR) + params[2];
          break;
        default:
          y = x;
          yRef = xR;
          console.warn(
            `Formuletype "${profile.scaling.formula}" niet herkend`
          );
      }
      f = y / yRef;
    }
    return f;
  }

  // ../nmd_bpm_backend/html/js/calculation/kernels.js
  function buildMPGKern(f_i, f_r, onv_herg, STAGES3) {
    const Ncol = STAGES3.length;
    let OHf = 1;
    if (onv_herg === "Ja") {
      OHf = 0.2;
    }
    const MPG_diag = new Array(Ncol).fill(1);
    STAGES3.forEach((mod, i) => {
      if (mod.startsWith("A1") || mod.startsWith("C3") || mod.startsWith("C4") || mod.startsWith("D")) {
        MPG_diag[i] = OHf;
      }
    });
    STAGES3.forEach((mod, i) => {
      if (mod.startsWith("B")) {
        MPG_diag[i] = f_i;
      }
    });
    const b5Col = STAGES3.indexOf("B5");
    MPG_diag[b5Col] = 0;
    const MPG_kern = Array.from(
      { length: Ncol },
      (_, row) => Array.from(
        { length: Ncol },
        (_2, col) => row === col ? MPG_diag[row] : 0
      )
    );
    const b4Col = STAGES3.indexOf("B4");
    if (b4Col !== -1) {
      STAGES3.forEach((mod, row) => {
        if (mod.startsWith("A") || mod.startsWith("B") || mod.startsWith("C")) {
          MPG_kern[row][b4Col] += f_r;
        }
      });
    }
    if (b4Col !== -1 & b5Col !== -1) {
      MPG_kern[b5Col][b4Col] = 0;
    }
    return MPG_kern;
  }

  // ../nmd_bpm_backend/html/js/calculation/stages.js
  var STAGES2 = [
    "A1-3",
    "A4",
    "A5",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "C1",
    "C2",
    "C3",
    "C4",
    "D"
  ];

  // ../nmd_bpm_backend/html/js/calculation/traceLogger.js
  var traceEntries = [];
  function startTrace() {
    clearTrace();
    addTrace({
      phase: "start",
      title: "Berekening gestart",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  function addTrace({
    phase = "info",
    title = "",
    description = "",
    data = null,
    product = null
  }) {
    traceEntries.push({
      id: crypto.randomUUID(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      phase,
      title,
      description,
      data,
      product
    });
  }
  function addError(title, error) {
    addTrace({
      phase: "error",
      title,
      description: error?.message || String(error)
    });
  }
  function addWarning(message) {
    addTrace({
      phase: "warning",
      title: "Waarschuwing",
      description: message
    });
  }
  function finishTrace(summary = {}) {
    addTrace({
      phase: "finish",
      title: "Berekening afgerond",
      data: summary
    });
  }
  function clearTrace() {
    traceEntries.length = 0;
  }
  function traceMatrix(phase, title, matrix, product = null) {
    addTrace({
      phase,
      title,
      product,
      data: {
        rows: matrix.length,
        columns: matrix[0]?.length || 0,
        matrix
      }
    });
  }
  function traceProduct(productId, title, description, data = null) {
    addTrace({
      phase: "product",
      product: productId,
      title,
      description,
      data
    });
  }

  // ../nmd_bpm_backend/html/js/producten/scalingProfiles.js
  function getScaleableProfiles(declaration) {
    const profiles = declaration?.environmental_profiles || [];
    return profiles.filter(
      (profile) => Array.isArray(
        profile?.scaling?.dimensions
      ) && profile.scaling.dimensions.length > 0
    );
  }
  function buildScalingEntry(profile, suppliedDimensies = []) {
    const inspectedValues = profile.scaling.dimensions.map(
      (dimension) => dimension.inspected_value
    );
    const dimensies = inspectedValues.map(
      (inspectedValue, index) => suppliedDimensies[index] ?? inspectedValue
    );
    return {
      id: crypto.randomUUID(),
      profiel: profile.title,
      dimensies,
      inspectedValues
    };
  }

  // ../nmd_bpm_backend/html/js/producten/schalingImport.js
  function reconcileScaling(suppliedSchaling, declaration, nmdId) {
    const warnings = [];
    const supplied = Array.isArray(suppliedSchaling) ? suppliedSchaling : [];
    const scaleableProfiles = getScaleableProfiles(
      declaration
    );
    if (supplied.length > 0 && scaleableProfiles.length === 0) {
      warnings.push(
        `Schaling opgegeven voor ${nmdId}, maar dit product heeft geen schaling`
      );
      return { schaling: [], warnings };
    }
    if (supplied.length === 0) {
      return { schaling: [], warnings };
    }
    const matchedProfileTitles = /* @__PURE__ */ new Set();
    const result = [];
    const unmatchedSupplied = [];
    for (const entry of supplied) {
      const match = entry.profiel && scaleableProfiles.find(
        (profile) => profile.title === entry.profiel && !matchedProfileTitles.has(profile.title)
      );
      if (match) {
        result.push(
          buildScalingEntry(
            match,
            entry.dimensies
          )
        );
        matchedProfileTitles.add(
          match.title
        );
      } else {
        unmatchedSupplied.push(
          entry
        );
      }
    }
    const remainingProfiles = scaleableProfiles.filter(
      (profile) => !matchedProfileTitles.has(profile.title)
    );
    if (unmatchedSupplied.length > 0 && remainingProfiles.length > 0) {
      const ordered = unmatchedSupplied.map(
        (entry, index) => ({
          entry,
          index
        })
      ).sort(
        (a, b) => {
          const diff = (b.entry.dimensies?.length || 0) - (a.entry.dimensies?.length || 0);
          return diff !== 0 ? diff : a.index - b.index;
        }
      ).map(
        (item) => item.entry
      );
      let anyAutoMatched = false;
      for (const entry of ordered) {
        const suppliedCount = entry.dimensies?.length || 0;
        const targetIndex = remainingProfiles.findIndex(
          (profile) => profile.scaling.dimensions.length >= suppliedCount
        );
        if (targetIndex === -1) {
          continue;
        }
        const target = remainingProfiles[targetIndex];
        result.push(
          buildScalingEntry(
            target,
            entry.dimensies
          )
        );
        remainingProfiles.splice(
          targetIndex,
          1
        );
        anyAutoMatched = true;
      }
      if (anyAutoMatched) {
        warnings.push(
          `Schaalprofielen voor ${nmdId} zijn automatisch gekoppeld op basis van aantal dimensies \u2014 controleer dit`
        );
      }
    }
    return { schaling: result, warnings };
  }

  // scripts/entry.mjs
  function calculateMPG({ project, producten, assessmentStrategy, impactIndicators }) {
    startTrace();
    try {
      const result = {
        mki: 0,
        mpg: 0,
        warnings: [],
        productRows: [],
        mkiMatrix: [],
        mpgMatrix: [],
        impactTable: [],
        impactLabels: [],
        impactIds: []
      };
      const levensduur = Number(project.levensduur) || 75;
      const bvo = Number(project.bvo) || 0;
      const denominator = bvo > 0 && levensduur > 0 ? bvo * levensduur : null;
      const weights = getWeights(assessmentStrategy, impactIndicators);
      const impactCount = weights.length;
      let mkiUnweighted = zeros(impactCount, STAGES2.length);
      let includedProducts = 0;
      for (const product of producten) {
        if (!product.nmd_id) {
          const warning = "Product zonder NMD-id overgeslagen";
          result.warnings.push(warning);
          addWarning(warning);
          continue;
        }
        const declaration = product._declaration;
        const registration = product._registration;
        const valid = product._declarationValid;
        if (!declaration) {
          const warning = `Geen milieuverklaring gevonden voor ${product.nmd_id}`;
          result.warnings.push(warning);
          addWarning(warning);
          continue;
        }
        if (!valid) {
          const peildatumHandhaven = project.peildatumHandhaven !== false;
          const warning = `Geen geldige verklaring op de peildatum voor ${product.nmd_id} \u2014 dichtstbijzijnde verklaring gebruikt` + (peildatumHandhaven ? " (product overgeslagen, Peildatum handhaven is actief)" : " (product toch meegenomen, Peildatum handhaven staat uit)");
          result.warnings.push(warning);
          addWarning(warning);
          if (peildatumHandhaven) {
            continue;
          }
        }
        traceProduct(product.nmd_id, "Milieuverklaring geselecteerd", declaration.construction_product?.title || "Onbekend product");
        const contribution = calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator });
        traceMatrix("calculation", "Productmatrix", contribution.matrix, product.nmd_id);
        contribution.warnings.forEach((warning) => result.warnings.push(warning));
        for (let i = 0; i < impactCount; i++) {
          for (let j = 0; j < STAGES2.length; j++) {
            mkiUnweighted[i][j] += contribution.matrix[i][j];
          }
        }
        result.productRows.push(contribution.summary);
        includedProducts++;
      }
      traceMatrix("aggregate", "Ongewogen MKI-matrix", mkiUnweighted);
      const mkiMatrix = applyWeights(mkiUnweighted, weights);
      traceMatrix("aggregate", "Gewogen MKI-matrix", mkiMatrix);
      result.mkiMatrix = mkiMatrix;
      result.mki = matrixSum(mkiMatrix);
      if (denominator) {
        result.mpgMatrix = mkiMatrix.map((row) => row.map((value) => value / denominator));
        traceMatrix("aggregate", "MPG-matrix", result.mpgMatrix);
        result.mpg = matrixSum(result.mpgMatrix);
      } else {
        const warning = "BVO ontbreekt of is 0. MPG kan niet worden berekend.";
        result.warnings.push(warning);
        addWarning(warning);
      }
      result.impactTable = buildImpactTable(mkiMatrix, result.mpgMatrix.length > 0 ? result.mpgMatrix : null, weights);
      result.impactLabels = weights.map((weight) => weight.title);
      result.impactIds = weights.map((weight) => weight.id);
      result.includedProducts = includedProducts;
      result.totalProducts = producten.length;
      finishTrace({ mki: result.mki, mpg: result.mpg, products: includedProducts });
      return result;
    } catch (error) {
      addError("MPG-berekening mislukt", error);
      throw error;
    }
  }
  function calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator }) {
    const impactCount = weights.length;
    const productMatrix = zeros(impactCount, STAGES2.length);
    const declaredLifespan = Number(declaration.construction_product?.lifespan) || levensduur;
    const lifespan = declaredLifespan === 999 ? levensduur : declaredLifespan;
    const f_i = Math.min(1, levensduur / lifespan);
    const f_r = Math.max(0, levensduur / lifespan - 1);
    const profiles = declaration.environmental_profiles || [];
    let matchedProfile = false;
    for (const profile of profiles) {
      const factor = calcScaleFactor(profile, product.schaling || []);
      const data = profile.environmental_data?.find((ed) => ed.assessment_strategy === assessmentStrategy?.id);
      if (!data || !data.scores) {
        const warning = `Geen scores gevonden voor strategie ${assessmentStrategy?.title || assessmentStrategy?.id} bij profiel "${profile.title || profile.id}" van ${product.nmd_id}`;
        addWarning(warning);
        continue;
      }
      matchedProfile = true;
      for (let i = 0; i < impactCount; i++) {
        for (let j = 0; j < STAGES2.length; j++) {
          productMatrix[i][j] += factor * (data.scores[i]?.[j] || 0);
        }
      }
    }
    const warnings = [];
    let unresolvedWarning = null;
    if (!matchedProfile) {
      unresolvedWarning = `Verklaring van ${product.nmd_id} ("${declaration.construction_product?.title || "onbekend product"}") is onopgelost: geen profiel met scores voor strategie ${assessmentStrategy?.title || assessmentStrategy?.id} gevonden`;
      addWarning(unresolvedWarning);
      warnings.push(unresolvedWarning);
    }
    if (!registration) {
      const registrationMissingWarning = `Geen registratiegegevens voor ${product.nmd_id} \u2014 categorie-3 opslag kan niet worden toegepast`;
      addWarning(registrationMissingWarning);
      warnings.push(registrationMissingWarning);
    }
    const aantal = Number(product.aantal) || 0;
    const categoryFactor = registration?.category === "category-3" ? 1.3 : 1;
    const dIndex = STAGES2.indexOf("D");
    const scaled = productMatrix.map((row) => row.map((value, colIndex) => {
      const withAantal = value * aantal;
      if (colIndex === dIndex && withAantal <= 0) {
        return withAantal;
      }
      return withAantal * categoryFactor;
    }));
    const kernel = buildMPGKern(f_i, f_r, product.onv_herg ? "Ja" : "Nee", STAGES2);
    const finalMatrix = matMul(scaled, kernel);
    const weightedMatrix = finalMatrix.map((row, i) => row.map((value) => value * weights[i].weight));
    const contribution = matrixSum(weightedMatrix);
    const mpgContribution = denominator ? contribution / denominator : null;
    return {
      matrix: finalMatrix,
      summary: {
        nmd_id: product.nmd_id,
        title: declaration.construction_product?.title || "",
        lifespan,
        aantal,
        f_i,
        f_r,
        contribution,
        mpg_contribution: mpgContribution,
        unresolved: !matchedProfile,
        matrix: weightedMatrix
      },
      warnings
    };
  }
  function getWeights(strategy, indicators) {
    const indicatorMap = {};
    indicators.forEach((indicator) => {
      indicatorMap[indicator.id] = indicator.title;
    });
    return (strategy.impact_indicators || []).sort((a, b) => a.ordering - b.ordering).map((weight) => ({
      id: weight.impact_indicator,
      title: indicatorMap[weight.impact_indicator] || weight.impact_indicator,
      weight: Number(weight.weight)
    }));
  }
  function applyWeights(matrix, weights) {
    return matrix.map((row, index) => row.map((value) => value * weights[index].weight));
  }
  function matrixSum(matrix) {
    return matrix.reduce((total, row) => total + row.reduce((r, v) => r + v, 0), 0);
  }
  function buildImpactTable(mki, mpg, weights) {
    return weights.map((ic, index) => ({
      title: ic.title,
      weight: ic.weight,
      mki: mki[index].reduce((a, b) => a + b, 0),
      mpg: mpg ? mpg[index].reduce((a, b) => a + b, 0) : null
    }));
  }
  return __toCommonJS(entry_exports);
})();
