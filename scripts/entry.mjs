import { zeros, matMul } from '../../nmd_bpm_backend/html/js/calculation/matrix.js';
import { calcScaleFactor } from '../../nmd_bpm_backend/html/js/calculation/scaling.js';
import { buildMPGKern } from '../../nmd_bpm_backend/html/js/calculation/kernels.js';
import { STAGES } from '../../nmd_bpm_backend/html/js/calculation/stages.js';
import {
  startTrace,
  finishTrace,
  traceProduct,
  traceMatrix,
  addWarning,
  addError,
} from '../../nmd_bpm_backend/html/js/calculation/traceLogger.js';

export * from '../../nmd_bpm_backend/html/js/calculation/kernels.js';
export * from '../../nmd_bpm_backend/html/js/calculation/scaling.js';
export { reconcileScaling } from '../../nmd_bpm_backend/html/js/producten/schalingImport.js';

export function calculateMPG({ project, producten, assessmentStrategy, impactIndicators }) {
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
      impactIds: [],
    };

    const levensduur = Number(project.levensduur) || 75;
    const bvo = Number(project.bvo) || 0;
    const denominator = bvo > 0 && levensduur > 0 ? bvo * levensduur : null;
    const weights = getWeights(assessmentStrategy, impactIndicators);
    const impactCount = weights.length;
    let mkiUnweighted = zeros(impactCount, STAGES.length);
    let includedProducts = 0;

    for (const product of producten) {
      if (!product.nmd_id) {
        const warning = 'Product zonder NMD-id overgeslagen';
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
        const warning = `Geen geldige verklaring op de peildatum voor ${product.nmd_id} — dichtstbijzijnde verklaring gebruikt` + (peildatumHandhaven ? ' (product overgeslagen, Peildatum handhaven is actief)' : ' (product toch meegenomen, Peildatum handhaven staat uit)');
        result.warnings.push(warning);
        addWarning(warning);
        if (peildatumHandhaven) {
          continue;
        }
      }

      traceProduct(product.nmd_id, 'Milieuverklaring geselecteerd', declaration.construction_product?.title || 'Onbekend product');
      const contribution = calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator });
      traceMatrix('calculation', 'Productmatrix', contribution.matrix, product.nmd_id);
      contribution.warnings.forEach((warning) => result.warnings.push(warning));

      for (let i = 0; i < impactCount; i++) {
        for (let j = 0; j < STAGES.length; j++) {
          mkiUnweighted[i][j] += contribution.matrix[i][j];
        }
      }

      result.productRows.push(contribution.summary);
      includedProducts++;
    }

    traceMatrix('aggregate', 'Ongewogen MKI-matrix', mkiUnweighted);
    const mkiMatrix = applyWeights(mkiUnweighted, weights);
    traceMatrix('aggregate', 'Gewogen MKI-matrix', mkiMatrix);
    result.mkiMatrix = mkiMatrix;
    result.mki = matrixSum(mkiMatrix);

    if (denominator) {
      result.mpgMatrix = mkiMatrix.map((row) => row.map((value) => value / denominator));
      traceMatrix('aggregate', 'MPG-matrix', result.mpgMatrix);
      result.mpg = matrixSum(result.mpgMatrix);
    } else {
      const warning = 'BVO ontbreekt of is 0. MPG kan niet worden berekend.';
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
    addError('MPG-berekening mislukt', error);
    throw error;
  }
}

function calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator }) {
  const impactCount = weights.length;
  const productMatrix = zeros(impactCount, STAGES.length);
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
      for (let j = 0; j < STAGES.length; j++) {
        productMatrix[i][j] += factor * (data.scores[i]?.[j] || 0);
      }
    }
  }

  const warnings = [];
  let unresolvedWarning = null;
  if (!matchedProfile) {
    unresolvedWarning = `Verklaring van ${product.nmd_id} ("${declaration.construction_product?.title || 'onbekend product'}") is onopgelost: geen profiel met scores voor strategie ${assessmentStrategy?.title || assessmentStrategy?.id} gevonden`;
    addWarning(unresolvedWarning);
    warnings.push(unresolvedWarning);
  }

  if (!registration) {
    const registrationMissingWarning = `Geen registratiegegevens voor ${product.nmd_id} — categorie-3 opslag kan niet worden toegepast`;
    addWarning(registrationMissingWarning);
    warnings.push(registrationMissingWarning);
  }

  const aantal = Number(product.aantal) || 0;
  const categoryFactor = registration?.category === 'category-3' ? 1.3 : 1;
  const dIndex = STAGES.indexOf('D');
  const scaled = productMatrix.map((row) => row.map((value, colIndex) => {
    const withAantal = value * aantal;
    if (colIndex === dIndex && withAantal <= 0) {
      return withAantal;
    }
    return withAantal * categoryFactor;
  }));

  const kernel = buildMPGKern(f_i, f_r, product.onv_herg ? 'Ja' : 'Nee', STAGES);
  const finalMatrix = matMul(scaled, kernel);
  const weightedMatrix = finalMatrix.map((row, i) => row.map((value) => value * weights[i].weight));
  const contribution = matrixSum(weightedMatrix);
  const mpgContribution = denominator ? contribution / denominator : null;

  return {
    matrix: finalMatrix,
    summary: {
      nmd_id: product.nmd_id,
      title: declaration.construction_product?.title || '',
      lifespan,
      aantal,
      f_i,
      f_r,
      contribution,
      mpg_contribution: mpgContribution,
      unresolved: !matchedProfile,
      matrix: weightedMatrix,
    },
    warnings,
  };
}

function getWeights(strategy, indicators) {
  const indicatorMap = {};
  indicators.forEach((indicator) => {
    indicatorMap[indicator.id] = indicator.title;
  });

  return (strategy.impact_indicators || [])
    .sort((a, b) => a.ordering - b.ordering)
    .map((weight) => ({
      id: weight.impact_indicator,
      title: indicatorMap[weight.impact_indicator] || weight.impact_indicator,
      weight: Number(weight.weight),
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
    mpg: mpg ? mpg[index].reduce((a, b) => a + b, 0) : null,
  }));
}
