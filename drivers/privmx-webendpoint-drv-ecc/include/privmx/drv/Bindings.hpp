#pragma once
#include <string>
#include <emscripten/val.h>

void performBindingsCall(const std::string& method, emscripten::val params, int callId);