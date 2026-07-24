#/******************************************************************************
#* Copyright (c) 2025 Sanechips, Inc.  All rights reserved.

#******************************************************************************/
include project_parameters.mk

PWD := $(shell pwd)
OBJDIR := $(PWD)/obj
HOOKS := $(PWD)/../../../../../
BINDIR := $(PWD)/bin
ROOTDIR := $(PWD)/../../../../..
ELF := $(ELFNAME).elf
BIN := $(ELFNAME).bin

$(shell if [ ! -e $(OBJDIR) ];then mkdir -p $(OBJDIR); fi)
$(shell if [ ! -e $(BINDIR) ];then mkdir -p $(BINDIR); fi)

$(shell if [ -d "${HOOKS}/.hooks/" ];then cp ${HOOKS}/.hooks/* ${HOOKS}/.git/hooks/ -f; fi)

ifeq ($(ARCH),arm)
ifeq ($(MODE),rom)

LDCRIPT := $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/build_files/gcc/linker-bl1-rom.ld
else
# LDCRIPT := $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/build_files/gcc/linker-bl1-sram.ld
LDCRIPT := $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/build_files/gcc/linker-bareos.ld
endif

CPU = -march=armv8-r
FPU = -mfpu=neon
FLOAT-ABI = -mfloat-abi=hard
else
LDCRIPT := $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/build_files/gcc/metal.ld
endif


INCLUDE_DIRS+=  $(foreach mod,$(MCAL_MODULE_LIST),$(PLUGINS_DIR)/$(mod)_$(AR_PKG_NAME)/include) \
				$(foreach mod,$(MCAL_MODULE_LIST),$(PLUGINS_DIR)/MCAL_Cfg_A1/generate/$(mod)/include) \
                $(foreach mod,$(MCAL_MODULE_LIST_ADDON),$(PLUGINS_DIR_ADDON)/$(mod)_$(AR_PKG_NAME_ADDON)/include) \
				$(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/include/module \
                $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/include/arch/$(ARCH) \
                $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/include/ \
				$(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/include/Base \
				$(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/src/arch/$(ARCH) 
				          
INCLUDE_DIRS+=  $(ADDITIONAL_INCLUDE_DIRS)

SRC_DIRS    +=  $(foreach mod,$(MCAL_MODULE_LIST),$(PLUGINS_DIR)/$(mod)_$(AR_PKG_NAME)/src) \
				$(foreach mod,$(MCAL_MODULE_LIST),$(PLUGINS_DIR)/MCAL_Cfg_A1/generate/$(mod)/src) \
                $(foreach mod,$(MCAL_MODULE_LIST_ADDON),$(PLUGINS_DIR_ADDON)/$(mod)_$(AR_PKG_NAME_ADDON)/src) \
                $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/src/common \
                $(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/startup/src/arch/$(ARCH) \
				$(PLUGINS_DIR)/Platform_$(AR_PKG_NAME)/src/module \
				$(PWD)/src \
	
SOURCE_FILES := $(foreach DIR,$(SRC_DIRS),$(notdir $(wildcard $(DIR)/*.c))) $(foreach DIR,$(SRC_DIRS),$(notdir $(wildcard $(DIR)/*.s))) $(foreach DIR,$(SRC_DIRS),$(notdir $(wildcard $(DIR)/*.S)))

TST_DIRS := $(foreach mod,$(MCAL_MODULE_LIST),$(PLUGINS_DIR)/$(mod)_$(AR_PKG_NAME)/examples/$(mod)_demo_A1/src/)

SOURCE_FILES += $(foreach DIR,$(TST_DIRS),$(notdir $(filter-out $(DIR)/Main.c, $(wildcard $(DIR)/*.c))))

# Object files
OBJS := $(SOURCE_FILES:.c=.o)
OBJS += $(SOURCE_FILES:.s=.o)
OBJS += $(SOURCE_FILES:.S=.o)


CFLAGS := -march=armv8-r $(FPU) $(FLOAT-ABI)  -O0 -g $(INCLUDES) -D$(ARCH)  -ffunction-sections -fdata-sections

LDFLAGS := -Wl,--gc-sections -Wl,-Map,$(BINDIR)/$(ELFNAME).map -nostartfiles -nostdlib  -T$(LDCRIPT) -Wl,--print-memory-usage $(FPU) $(FLOAT-ABI) 

CFLAGS += $(addprefix -I, $(INCLUDE_DIRS))

CFLAGS += -DLOG_LEVEL=40
CFLAGS += $(EXT_CFLAGS)

DEP_FLAG =-MT"$(@)" -MMD -MP -MF"$(OBJDIR)/$(*).d"

.PHONY: build
build: $(ELFNAME).elf $(BIN)

# Link all the object files to become one elf file
$(ELFNAME).elf : $(OBJS)
	@echo "Linking $@"
	@$(CC) $(CFLAGS) $(LDFLAGS) $(OBJDIR)/*.o  -o $(BINDIR)/$@ -lc -lgcc
#$(wildcard $(foreach dir,$(TST_DIRS),$(dir)/*.o) -o $(BINDIR)/$@ -lc -lgcc
 
$(BIN): $(ELF)
	@echo "  BIN    $@"
	$(OBJCOPY) -O binary $(BINDIR)/$< $(BINDIR)/$@
	@echo "  Built $@ successfully"

#add path for .o and .c filer to easy to automatically look up in sub folder
vpath %.c $(SRC_DIRS)  
vpath %.c $(TST_DIRS)
vpath %.o $(OBJDIR)
#add the rule to check if OBJDIR has been already created before start but we do want to rebuild .o so OBJDIR is added as order-only-prerequisites
%.o: %.c | $(OBJDIR)
	@echo "Compiling $<"
	$(CC) $(CFLAGS) -c $< -MMD -o $(OBJDIR)/$@
$(OBJDIR): $(mkdir)
vpath %.s $(addsuffix :, $(SRC_DIRS))
vpath %.S $(addsuffix :, $(SRC_DIRS))
%.o : %.s
	@echo "Compiling $<"
	@$(CC) $(CFLAGS) -c $< -MMD -o $(OBJDIR)/$@
%.o : %.S
	@echo "Compiling $<"
	@$(CC) $(CFLAGS) -c $< -MMD -o $(OBJDIR)/$@

#include new .d files which contain new rule created from gcc auto-depend generation
-include $(wildcard $(OBJDIR)/*.d)


clean:
	rm -rf $(OBJDIR)/*
	rm -rf $(BINDIR)/*


