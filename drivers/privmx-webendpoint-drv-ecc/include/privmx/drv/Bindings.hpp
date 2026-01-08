#pragma once
#include <emscripten/val.h>

#include <string>

void performBindingsCall(const std::string& method, emscripten::val params, int callId);