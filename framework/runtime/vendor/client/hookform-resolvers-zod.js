// universe/node_modules/.pnpm/@hookform+resolvers@5.4.0_react-hook-form@7.81.0_react@19.2.8_/node_modules/@hookform/resolvers/dist/resolvers.mjs
import { get as e, set as t } from "./rhf.js";
var r = (t3, r2, o3) => {
  if (t3 && "reportValidity" in t3) {
    const s3 = e(o3, r2);
    t3.setCustomValidity(s3 && s3.message || ""), t3.reportValidity();
  }
};
var o = (e2, t3) => {
  for (const o3 in t3.fields) {
    const s3 = t3.fields[o3];
    s3 && s3.ref && "reportValidity" in s3.ref ? r(s3.ref, o3, e2) : s3 && s3.refs && s3.refs.forEach((t4) => r(t4, o3, e2));
  }
};
var s = (r2, s3) => {
  s3.shouldUseNativeValidation && o(r2, s3);
  const n3 = {};
  for (const o3 in r2) {
    const c = e(s3.fields, o3), f = Object.assign(r2[o3] || {}, { ref: c && c.ref });
    if (i(s3.names || Object.keys(r2), o3)) {
      const r3 = Object.assign({}, e(n3, o3));
      t(r3, "root", f), t(n3, o3, r3);
    } else t(n3, o3, f);
  }
  return n3;
};
var i = (e2, t3) => {
  const r2 = n(t3).replace(/[.*+?^${}()|\\]/g, "\\$&");
  return e2.some((e3) => n(e3).match(`^${r2}\\.\\d+`));
};
function n(e2) {
  return e2.replace(/[\[\]]/g, "");
}

// universe/node_modules/.pnpm/@hookform+resolvers@5.4.0_react-hook-form@7.81.0_react@19.2.8_/node_modules/@hookform/resolvers/zod/dist/zod.mjs
import { appendErrors as n2 } from "./rhf.js";
import * as o2 from "zod/v4/core";
function t2() {
  return t2 = Object.assign ? Object.assign.bind() : function(r2) {
    for (var e2 = 1; e2 < arguments.length; e2++) {
      var n3 = arguments[e2];
      for (var o3 in n3) ({}).hasOwnProperty.call(n3, o3) && (r2[o3] = n3[o3]);
    }
    return r2;
  }, t2.apply(null, arguments);
}
function s2(r2, e2) {
  try {
    var n3 = r2();
  } catch (r3) {
    return e2(r3);
  }
  return n3 && n3.then ? n3.then(void 0, e2) : n3;
}
function i2(r2, e2) {
  for (var o3 = {}; r2.length; ) {
    var t3 = r2[0], s3 = t3.code, i3 = t3.message, a2 = t3.path.join(".");
    if (!o3[a2]) if ("unionErrors" in t3) {
      var u2 = t3.unionErrors[0].errors[0];
      o3[a2] = { message: u2.message, type: u2.code };
    } else o3[a2] = { message: i3, type: s3 };
    if ("unionErrors" in t3 && t3.unionErrors.forEach(function(e3) {
      return e3.errors.forEach(function(e4) {
        return r2.push(e4);
      });
    }), e2) {
      var c = o3[a2].types, f = c && c[t3.code];
      o3[a2] = n2(a2, e2, o3, s3, f ? [].concat(f, t3.message) : t3.message);
    }
    r2.shift();
  }
  return o3;
}
function a(r2, e2) {
  for (var o3 = {}, s3 = function() {
    var s4 = r2[0], i3 = s4.code, a2 = s4.message, u2 = s4.path.join(".");
    if (!o3[u2]) if ("invalid_union" === s4.code && s4.errors.length > 0) {
      var c = s4.errors[0][0];
      o3[u2] = { message: c.message, type: c.code };
    } else o3[u2] = { message: a2, type: i3 };
    if ("invalid_union" === s4.code && s4.errors.forEach(function(e3) {
      return e3.forEach(function(e4) {
        return r2.push(t2({}, e4, { path: [].concat(s4.path, e4.path) }));
      });
    }), e2) {
      var f = o3[u2].types, l = f && f[s4.code];
      o3[u2] = n2(u2, e2, o3, i3, l ? [].concat(l, s4.message) : s4.message);
    }
    r2.shift();
  }; r2.length; ) s3();
  return o3;
}
function u(n3, t3, u2) {
  if (void 0 === u2 && (u2 = {}), (function(r2) {
    return "_def" in r2 && "object" == typeof r2._def && "typeName" in r2._def;
  })(n3)) return function(o3, a2, c) {
    try {
      return Promise.resolve(s2(function() {
        return Promise.resolve(n3["sync" === u2.mode ? "parse" : "parseAsync"](o3, t3)).then(function(e2) {
          return c.shouldUseNativeValidation && o({}, c), { errors: {}, values: u2.raw ? Object.assign({}, o3) : e2 };
        });
      }, function(r2) {
        if ((function(r3) {
          return Array.isArray(null == r3 ? void 0 : r3.issues);
        })(r2)) return { values: {}, errors: s(i2(r2.errors, !c.shouldUseNativeValidation && "all" === c.criteriaMode), c) };
        throw r2;
      }));
    } catch (r2) {
      return Promise.reject(r2);
    }
  };
  if ((function(r2) {
    return "_zod" in r2 && "object" == typeof r2._zod;
  })(n3)) return function(i3, c, f) {
    try {
      return Promise.resolve(s2(function() {
        return Promise.resolve(("sync" === u2.mode ? o2.parse : o2.parseAsync)(n3, i3, t3)).then(function(e2) {
          return f.shouldUseNativeValidation && o({}, f), { errors: {}, values: u2.raw ? Object.assign({}, i3) : e2 };
        });
      }, function(r2) {
        if ((function(r3) {
          return r3 instanceof o2.$ZodError;
        })(r2)) return { values: {}, errors: s(a(r2.issues, !f.shouldUseNativeValidation && "all" === f.criteriaMode), f) };
        throw r2;
      }));
    } catch (r2) {
      return Promise.reject(r2);
    }
  };
  throw new Error("Invalid input: not a Zod schema");
}
export {
  u as zodResolver
};
