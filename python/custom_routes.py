import asyncio
import base64
import concurrent.futures
import copy
import os
import uuid
import time
import traceback
import random
import requests
import importlib
import sys
import datetime
from aiohttp import web
from .user import load_user_profile

import server
import execution
import folder_paths

from .upload import upload_file_specs
from .upload.spec import FileSpecContextManager
from .upload.progress import progress_dict, reset_progress

from .utils.paths import build_paths
from .utils.task import task_create, task_set_status, task_set_progress, task_get_by_id, task_serialize, TaskStatus

from .utils.requirements import update_requirements


@server.PromptServer.instance.routes.post("/comfy-cloud/validate-input-path")
async def validate_input_path(request):
    try:
        data = await request.json()
        input_paths = data.get("paths")

        paths_not_found = []
        base = folder_paths.base_path
        for path in input_paths:
            full_path = os.path.join(base, 'input', path)

            if not os.path.exists(full_path):
                paths_not_found.append(path)

        return web.json_response({ "invalid_paths": paths_not_found }, status=200)
    except Exception as e:
        print("Error:", e)
        return web.json_response({ "error": e }, status=400)

@server.PromptServer.instance.routes.post("/comfy-cloud/validate-path")
async def validate_path_directory(request):
    try:
        data = await request.json()
        input_path = data.get("path")

        exists = os.path.exists(input_path)

        return web.json_response({ "exists": exists }, status=200)
    except Exception as e:
        print("Error:", e)
        return web.json_response({ "error": e }, status=400)

@server.PromptServer.instance.routes.post("/comfy-cloud/validate-prompt")
async def comfy_cloud_validate_prompt(request):
    data = await request.json()

    workflow_api = data.get("workflow_api")

    def random_seed(num_digits=15):
        range_start = 10 ** (num_digits - 1)
        range_end = (10**num_digits) - 1
        return random.randint(range_start, range_end)

    for key in workflow_api:
        if 'inputs' in workflow_api[key] and 'seed' in workflow_api[key]['inputs']:
            workflow_api[key]['inputs']['seed'] = random_seed()

    try:
        valid = execution.validate_prompt(workflow_api)

        if valid[0]:
            return web.json_response({ "is_valid": True, "node_errors": valid[3] }, status=200)
        else:
            return web.json_response({ "is_valid": False, "node_errors": valid[3] }, status=200)

    except Exception as e:
        print("Error:", e)
        return web.json_response({ "error": e }, status=400)


@server.PromptServer.instance.routes.get("/comfy-cloud/user")
async def comfy_cloud_run(request):
    try:
        data = load_user_profile()
        return web.json_response({
            "user": data
        }, content_type='application/json')
    except Exception as e:
        print("Error:", e)
        return web.json_response({ "error": e }, status=400)

@server.PromptServer.instance.routes.get("/comfy-cloud/custom-nodes-list")
async def get_custom_nodes_list(request):
    custom_nodes = {}
    node_paths = folder_paths.get_folder_paths("custom_nodes")
    for custom_node_path in node_paths:
        possible_modules = os.listdir(os.path.realpath(custom_node_path))
        if "__pycache__" in possible_modules:
            possible_modules.remove("__pycache__")

        for possible_module in possible_modules:
            module_path = os.path.join(custom_node_path, possible_module)
            if os.path.isfile(module_path) and os.path.splitext(module_path)[1] != ".py": continue
            if module_path.endswith(".disabled"): continue
            mappings = get_custom_node_mappings(module_path)
            custom_nodes[mappings[0]] = mappings[1]

    return web.json_response({'custom_nodes': custom_nodes}, content_type='application/json')

def get_custom_node_mappings(module_path, ignore=set()):
    mappings = []

    module_name = os.path.basename(module_path)
    if os.path.isfile(module_path):
        sp = os.path.splitext(module_path)
        module_name = sp[0]
    try:
        if os.path.isfile(module_path):
            module_spec = importlib.util.spec_from_file_location(module_name, module_path)
            module_dir = os.path.split(module_path)[0]
        else:
            module_spec = importlib.util.spec_from_file_location(module_name, os.path.join(module_path, "__init__.py"))
            module_dir = module_path

        module = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(module)

        if hasattr(module, "NODE_CLASS_MAPPINGS") and getattr(module, "NODE_CLASS_MAPPINGS") is not None:
            for name in module.NODE_CLASS_MAPPINGS:
                if name not in ignore:
                    mappings.append(name)

            return (module_name, mappings)
        else:
            # Skip module for custom nodes due to the lack of NODE_CLASS_MAPPINGS.
            return (module_name, [])
    except Exception as e:
        print(traceback.format_exc())
        print(f"Cannot import {module_path} module for custom nodes:", e)
        return (module_name, [])

            
async def upload_task_execution(task_id, file_specs, workflow_id):
    try:
        task_set_status(task_id, TaskStatus.HASHING)
        await upload_file_specs(
            file_specs, 
            workflow_id, 
            hashing_complete_callback = lambda: task_set_status(task_id, TaskStatus.UPLOADING),
        )

        # cleanup temp
        task_set_status(task_id, TaskStatus.COMPLETED)
    except Exception as e:
        print("Upload task execution error:", e)
        task_set_status(task_id, TaskStatus.ERROR)

    finally:
        reset_progress(progress_dict)


@server.PromptServer.instance.routes.post("/comfy-cloud/upload")
async def upload_dependencies(request):
    # Make a request to localhost
    try:
        json_data = await request.json()
        workflow_id = json_data["workflow_id"]
        base = folder_paths.base_path

        # Paths
        paths_to_upload = {
            "models": os.path.join(base, "models"),
            "custom_nodes": os.path.join(base, "custom_nodes"),
            "input": os.path.join(base, "input")
        }
        dep_lists = {
            "models": json_data["modelsToUpload"],
            "custom_nodes": json_data["nodesToUpload"],
            "input": json_data["filesToUpload"]
        }
        
        # Create upload task
        task_id = task_create()

        # Our server uses a custom dependency manager
        # that requires a specific format for requirements.txt.
        # Loop through all dependent custom nodes and patch.
        update_requirements()

        # Get dependency paths
        paths = build_paths(paths_to_upload, dep_lists, workflow_id)

        # Generate file specs for upload
        file_specs = []

        with FileSpecContextManager(file_specs) as batch:
            for path in paths:
                local_path = path[0]
                remote_path = path[1]
                if os.path.isfile(local_path):
                    batch.put_file(local_path, remote_path)
                elif os.path.isdir(local_path):
                    batch.put_directory(local_path, remote_path)
                else:
                    raise Exception("Something went wrong")

            print("Generating specs")
            file_specs = batch.generate_specs()

        # Finally, we queue upload task in background
        asyncio.ensure_future(upload_task_execution(task_id, file_specs, workflow_id))

        return web.json_response({'success': True, 'task_id': task_id}, content_type='application/json')
    except Exception as e:
        print("Error", e)
        return web.json_response({'success': False, 'message': str(e)}, status=500, content_type='application/json')

@server.PromptServer.instance.routes.get("/comfy-cloud/upload-status/{task_id}")
async def get_task_status(request):
    task_id = request.match_info['task_id']

    task_set_progress(task_id, progress_dict)
    task = task_get_by_id(task_id)

    return web.json_response(task_serialize(task))    


